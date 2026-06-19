import { _decorator, Component, Node, Label, Prefab, instantiate, Vec3, randomRange, Sprite, RigidBody2D, BoxCollider2D, Size, UITransform, CCInteger, CCString, tween, AudioSource, AudioClip, UIOpacity, Color, LabelOutline, Tween, Button, v3, Layout } from 'cc';
import { ItemData } from './ItemData';
import { ItemController } from './ItemController';
import { CollectionTrackerUI } from './CollectionTrackerUI';
import { TutorialController } from './TutorialController';
import { Analytics, analyticsEvents } from './Analytics';

const { ccclass, property } = _decorator;

@ccclass('CollectionGoal')
export class CollectionGoal {
    @property
    public categoryName: string = "";
    @property({type: [CCInteger]})
    public requiredItemIds: number[] = [];
    public isComplete: boolean = false;
}

@ccclass('GameManager')
export class GameManager extends Component {
    // --- All Properties ---
    @property({ type: [ItemData] }) public itemDefinitions: ItemData[] = [];
    @property({ type: [CollectionGoal] }) public collectionGoals: CollectionGoal[] = [];
    @property({ type: [CollectionTrackerUI] }) public collectionTrackers: CollectionTrackerUI[] = [];
    @property({type: Node}) public dragToMatchText: Node | null = null;
    @property({ type: Prefab }) public itemBasePrefab: Prefab = null;
    @property({ type: Node }) public itemContainer: Node = null;
    @property({ type: Node }) public uiCanvas: Node = null;
    @property({ type: Prefab }) public mergeEffectPrefab: Prefab = null;
    @property({type: CCInteger}) public gameDuration: number = 45;
    @property({type: Label}) public timerLabel: Label = null;
    @property({ type: [CCInteger] }) public initialSpawnItemIds: number[] = [];
    @property({ type: TutorialController }) public tutorialController: TutorialController = null;
    @property({type: Node}) public endScreenNode: Node = null;
    @property({type: Label}) public endScreenTitleLabel: Label = null;
    @property({type: CCString}) public winMessage: string = "Congratulations!";
    @property({type: CCString}) public loseMessage: string = "Try Again!";
    @property({ type: CCInteger }) public tutorialItemId: number = 401;
    @property({type: Node}) public tutorialSpotlightOverlay: Node = null;
    @property({type: Node}) public spotlightGlow1: Node = null;
    @property({type: Node}) public spotlightGlow2: Node = null;
    @property({ type: AudioSource }) public sfxAudioSource: AudioSource = null;
    @property({ type: AudioSource }) public bgmAudioSource: AudioSource | null = null;
    @property({ type: Prefab }) public collectionParticlePrefab: Prefab | null = null;
    @property({ type: Node }) public screenGlowNode: Node | null = null;
    @property({type: Node}) public trashBinButtonNode: Node | null = null;
    @property({ type: [CCInteger] }) public spawnPathXCoordinates: number[] = [-150, 0, 150];
    @property({type: Label, tooltip: "The UI Label to display the diamond count."}) public diamondLabel: Label | null = null;
    @property({type: Label, tooltip: "The UI Label to display the energy count."}) public energyLabel: Label | null = null;
    @property({ type: Prefab }) public timeRewardTextPrefab: Prefab | null = null;

    public isGameOver: boolean = false;
    private readonly IDLE_TUTORIAL_THRESHOLD = 10;
    private readonly SPOTLIGHT_DARK_OPACITY = 200;
    private readonly ACTIVE_COLLECTION_COUNT = 2;
    // private readonly TRASH_COST_SECONDS = 10;
    private readonly ENERGY_COST_TO_SPAWN = 5;
    
    private idleTime: number = 0;
    private collectionProgress: Map<string, Set<number>> = new Map();
    private timeRemaining: number = 0;
    private isGameStarted: boolean = false;
    private isTutorialActive: boolean = false;
    private isInitialTutorialActive: boolean = false;
    private originalStartNodeParent: Node = null;
    private isIdleSpotlightActive: boolean = false;
    private idleSpotlightItems: Node[] = [];
    private isWaitingForFinalMerge: boolean = false;
    private isInitialClickTutorialActive: boolean = false;
    private originalClickTutorialParent: Node | null = null;
    private originalClickTutorialSiblingIndex: number = 0;
    private originalClickTutorialLayout: Layout | null = null;
    
    private playerDiamonds: number = 0;
    private playerEnergy: number = 0;
    private clickTutorialTextContainer: Node | null = null;

    start() {
        this.createClickTutorialText();

        this.isInitialClickTutorialActive = false; 
        if (this.endScreenNode) this.endScreenNode.active = false;
        if (this.tutorialSpotlightOverlay) this.tutorialSpotlightOverlay.active = false;

        this.playerDiamonds = 0;
        this.playerEnergy = 150;
        this.updateCurrencyUI();
        
        if (this.dragToMatchText) {
            this.dragToMatchText.active = true;
            this.dragToMatchText.getComponent(Label)!.string = "Drag To Match";
            const opacityComp = this.dragToMatchText.getComponent(UIOpacity) ?? this.dragToMatchText.addComponent(UIOpacity);
            opacityComp.opacity = 255;
            this.dragToMatchText.setScale(new Vec3(0,0,1));

            tween(this.dragToMatchText)
                .delay(0.5)
                .to(0.6, { scale: new Vec3(1,1,1) }, { easing: 'backOut' })
                .call(() => { 
                    if (this.dragToMatchText?.isValid) {
                        tween(this.dragToMatchText)
                            .sequence(
                                tween().to(0.7, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'quadInOut' }),
                                tween().to(0.7, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'quadInOut' })
                            )
                            .repeatForever()
                            .start();
                    }
                })
                .start();
        }
    
        this.collectionProgress.clear();
        this.isGameOver = false; this.isGameStarted = false; this.isTutorialActive = false;
        this.isInitialTutorialActive = true; this.isIdleSpotlightActive = false; 
        this.idleTime = 0;
        this.isWaitingForFinalMerge = false;
        this.collectionGoals.forEach(goal => goal.isComplete = false);

        this.collectionTrackers.forEach((tracker, index) => {
            if (tracker?.node) {
                tracker.node.active = true;
                const goal = this.collectionGoals[index];
                if (goal) {
                    tracker.gameManager = this;
                    tracker.categoryName = goal.categoryName;
                    tracker.updateProgress(0, goal.requiredItemIds.length);
                }
                const button = tracker.node.getComponent(Button);
                if(button) button.interactable = false;
                if (index === 0 || index === 1) tracker.setStateActive(false);
                else tracker.setStateLocked();
            }
        });
        
        if(this.trashBinButtonNode) {
            const button = this.trashBinButtonNode.getComponent(Button);
            if(button) button.interactable = false;
        }

        this.timeRemaining = this.gameDuration;
        if (this.timerLabel) this.timerLabel.string = this.formatTime(this.timeRemaining);
        this.refreshCollectionTrackerStates();
        this.spawnInitialItems();
        this.scheduleOnce(() => this.runInitialTutorialStep(), 1.0);
        
        // Track game display
        this.scheduleOnce(() => {
            Analytics.instance?.dispatchEvent(analyticsEvents.DISPLAYED);
        }, 0.5);

        // Trash bin commented out - items no longer deleted
        // if (this.trashBinButtonNode) {
        //     this.trashBinButtonNode.on(Button.EventType.CLICK, this.onTrashBinClicked, this);
        // }
    }
    
    update(deltaTime: number) {
        if (this.isGameOver) return;
        if (this.isGameStarted) {
            if (this.timeRemaining > 0) {
                this.timeRemaining -= deltaTime;
                if (this.timerLabel) this.timerLabel.string = this.formatTime(this.timeRemaining);
            } else this.endGame(false);
        }
        if (
            !this.isInitialTutorialActive &&
            !this.isInitialClickTutorialActive &&
            !this.isTutorialActive &&
            !this.isIdleSpotlightActive &&
            !this.isWaitingForFinalMerge // Also pause idle check when waiting
        ) {
            this.idleTime += deltaTime;
            if (this.idleTime >= this.IDLE_TUTORIAL_THRESHOLD) {
                this.tryStartHandTutorial();
            }
        }
    }
    
    private createClickTutorialText(): void {
        if (this.clickTutorialTextContainer) return;
        if (!this.dragToMatchText) {
            console.warn("dragToMatchText is not assigned! Cannot create tutorial text from it.");
            return;
        }
        
        const templateLabel = this.dragToMatchText.getComponent(Label);
        if (!templateLabel) return;
        const templateOutline = this.dragToMatchText.getComponent(LabelOutline);

        const containerNode = new Node("ClickTutorialText_Container");

        const offsets = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
        offsets.forEach(offset => {
            const shadowNode = new Node("ShadowLabel");
            const shadowLabel = shadowNode.addComponent(Label);
            shadowLabel.string = "Tap to Get an Item";
            shadowLabel.font = templateLabel.font;
            shadowLabel.useSystemFont = templateLabel.useSystemFont;
            shadowLabel.fontSize = templateLabel.fontSize;
            shadowLabel.lineHeight = templateLabel.lineHeight;
            shadowLabel.color = templateOutline ? templateOutline.color.clone() : Color.BLACK;
            shadowNode.setPosition(offset[0], offset[1], 0);
            containerNode.addChild(shadowNode);
        });

        const primaryNode = new Node("PrimaryLabel");
        const primaryLabel = primaryNode.addComponent(Label);
        primaryLabel.string = "Tap to Get an Item";
        primaryLabel.font = templateLabel.font;
        primaryLabel.useSystemFont = templateLabel.useSystemFont;
        primaryLabel.fontSize = templateLabel.fontSize;
        primaryLabel.lineHeight = templateLabel.lineHeight;
        primaryLabel.color = templateLabel.color.clone();
        containerNode.addChild(primaryNode);

        containerNode.setPosition(this.dragToMatchText.position.clone());
        this.dragToMatchText.parent.addChild(containerNode);

        containerNode.addComponent(UIOpacity).opacity = 0;
        
        this.clickTutorialTextContainer = containerNode;
        this.clickTutorialTextContainer.active = false;
    }

    public playerDidStartDrag() {
        if(this.dragToMatchText?.active) {
            Tween.stopAllByTarget(this.dragToMatchText); 
            const opacityComp = this.dragToMatchText.getComponent(UIOpacity)!;
            tween(opacityComp).to(0.3, { opacity: 0 }).call(() => { this.dragToMatchText!.active = false; }).start();
        }
        if (this.isIdleSpotlightActive) this.cleanupIdleSpotlight();
        if (this.isTutorialActive) { this.isTutorialActive = false; this.tutorialController?.stopTutorial(); }
        this.idleTime = 0;
        if (!this.isGameStarted && !this.isWaitingForFinalMerge) { // Don't restart BGM if we're just waiting
            this.isGameStarted = true;
            this.bgmAudioSource?.play();
            // Track challenge start
            Analytics.instance?.dispatchEvent(analyticsEvents.CHALLENGE_STARTED);
            this.collectionTrackers.forEach((tracker, index) => {
                const button = tracker.node.getComponent(Button);
                if (button) button.interactable = true;
                // Collection UI pulsing disabled - not using tap to spawn
                // if(index === 0 || index === 1) tracker.startPulseAnimation();
            });
            if (this.trashBinButtonNode) {
                const button = this.trashBinButtonNode.getComponent(Button);
                if (button) button.interactable = true;
            }
        }
    }
    
    public handleMerge(itemId: number, mergedLevel: number, position: Vec3) {
        if (this.isWaitingForFinalMerge) {
            console.log("Final merge detected! Ending the game.");
            if (this.isIdleSpotlightActive) this.cleanupIdleSpotlight();
            if (this.isTutorialActive) this.tutorialController?.stopTutorial();
            this.endGame(true);
            return;
        }

        const wasDragTutorialActive = this.isInitialTutorialActive;
        const itemData = this.itemDefinitions.find(data => data.itemId === itemId);
        if (this.sfxAudioSource && itemData?.mergeSound) this.sfxAudioSource.playOneShot(itemData.mergeSound);
        if (this.mergeEffectPrefab) { 
            const particleNode = instantiate(this.mergeEffectPrefab);
            particleNode.setParent(this.itemContainer);
            particleNode.setPosition(position);
        }
        
        let newItem: Node | null = null;
        if (mergedLevel + 1 >= 2) {
            this.animateItemToCollectionUI(itemId, position);
        } else {
            newItem = this.createItem(itemId, mergedLevel + 1, position);
        }
        
        // Spawn one item to fall down after each successful merge
        this.scheduleOnce(() => {
            this.spawnAutoItem();
        }, 0.3);
        
        // Clean up initial tutorial after first merge
        if (wasDragTutorialActive) {
            this.cleanupInitialTutorial(newItem);
        }
        if (this.isIdleSpotlightActive) this.cleanupIdleSpotlight();
    }
    
    public requestItemSpawn(categoryName: string) {
        if (this.isInitialClickTutorialActive) this.cleanupInitialClickTutorial();
        if (this.isGameOver || this.isWaitingForFinalMerge) return; // Prevent spawning during final wait
        const requestedGoalIndex = this.collectionGoals.findIndex(g => g.categoryName === categoryName);
        if (requestedGoalIndex === -1) return;
        const isClickable = this.getActiveIncompleteGoalIndexes().includes(requestedGoalIndex);
        if (!isClickable) return;
        const activeGoal = this.collectionGoals[requestedGoalIndex];
        const missingItemIds = this.getMissingItemIds(activeGoal);
        const spawnableItemDefs = this.itemDefinitions.filter(def => missingItemIds.includes(def.itemId));
        if (spawnableItemDefs.length === 0) return;
        if (this.playerEnergy < this.ENERGY_COST_TO_SPAWN) {
            if(this.energyLabel) this.playScoreAnimation(this.energyLabel.node, true);
            return;
        }

        this.playerEnergy -= this.ENERGY_COST_TO_SPAWN;
        this.updateCurrencyUI();
        const randomItemData = spawnableItemDefs[Math.floor(randomRange(0, spawnableItemDefs.length))];
        this.createItem(randomItemData.itemId, 0, this.getSpawningPosition());
    }

    // Trash bin deletion commented out - replaced with auto-spawn on merge
    // private onTrashBinClicked() {
    //     if (this.isGameOver || !this.isGameStarted || this.timeRemaining <= this.TRASH_COST_SECONDS) return;
    // 
    //     this.timeRemaining -= this.TRASH_COST_SECONDS;
    //     if (this.timerLabel) {
    //         this.timerLabel.string = this.formatTime(this.timeRemaining);
    //         const timerNode = this.timerLabel.node;
    //         const originalColor = this.timerLabel.color.clone();
    //         tween(timerNode).to(0.1, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'quadOut' })
    //            .call(() => { this.timerLabel!.color = Color.RED; })
    //            .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'bounceOut' })
    //            .call(() => { tween(this.timerLabel!.color).to(0.3, {r: originalColor.r, g: originalColor.g, b: originalColor.b, a: originalColor.a}).start() })
    //            .start();
    //     }
    //     
    //     const trashWorldPos = this.trashBinButtonNode!.getComponent(UITransform)!.convertToWorldSpaceAR(Vec3.ZERO);
    //     const trashTargetPos = this.itemContainer.getComponent(UITransform)!.convertToNodeSpaceAR(trashWorldPos);
    //     const itemsToTrash = this.itemContainer.children.filter(node => node.getComponent(ItemController));
    //     itemsToTrash.forEach(itemNode => {
    //         if (itemNode.isValid) {
    //             itemNode.getComponent(RigidBody2D)!.enabled = false;
    //             itemNode.getComponent(ItemController)!.enabled = false;
    //             tween(itemNode).to(0.4, { position: trashTargetPos, scale: Vec3.ZERO }, { easing: 'backIn' }).call(() => itemNode.destroy()).start();
    //         }
    //     });
    // }

    private animateItemToCollectionUI(itemId: number, startPosition: Vec3) {
        const itemData = this.itemDefinitions.find(data => data.itemId === itemId);
        const goal = this.collectionGoals.find(g => g.requiredItemIds.includes(itemId));
        if (!itemData || !goal) return;
        const trackerUI = this.collectionTrackers.find(t => t.categoryName === goal.categoryName);
        if (!trackerUI || !this.uiCanvas) return;
        if (this.sfxAudioSource && itemData.collectionSound) this.sfxAudioSource.playOneShot(itemData.collectionSound);
        
        this.grantCollectionRewards(); 
        const progressSet = this.collectionProgress.get(goal.categoryName) || new Set();
        const isNewItem = !progressSet.has(itemId);
        if (isNewItem) {
            progressSet.add(itemId);
            this.collectionProgress.set(goal.categoryName, progressSet);
        } else {
            return; 
        }
        
        trackerUI.updateProgress(progressSet.size, goal.requiredItemIds.length);
        
        const animNode = new Node('CollectedItemAnimation');
        const sprite = animNode.addComponent(Sprite);
      
        sprite.spriteFrame = itemData.colorSprite;
        this.uiCanvas.addChild(animNode);

        const startNodePos = this.uiCanvas.getComponent(UITransform)!.convertToNodeSpaceAR(this.itemContainer.getComponent(UITransform)!.convertToWorldSpaceAR(startPosition));
        const targetNodePos = this.uiCanvas.getComponent(UITransform)!.convertToNodeSpaceAR(trackerUI.node.getComponent(UITransform)!.convertToWorldSpaceAR(Vec3.ZERO));
        const centerScreenPos = new Vec3(-350, 350, 0);
        animNode.setPosition(startNodePos);
        tween(animNode).to(0.3, { position: centerScreenPos, scale: v3(1.5, 1.5, 1) }, { easing: 'quadOut' })
            .delay(0.2).to(0.6, { position: targetNodePos, scale: v3(0.5, 0.5, 1) }, { easing: 'cubicIn' })
            .call(() => {
                trackerUI.playCollectionEffect();
                this.updateCollectionProgress(goal.categoryName);
                animNode.destroy();
            }).start();
    }
    
    private grantCollectionRewards() {
        this.playerDiamonds += 25;
        this.playerEnergy += 15;
        this.showTimeRewardText();
        this.updateCurrencyUI(true);
    }
    
    private updateCurrencyUI(animate: boolean = false) {
        if (this.diamondLabel) {
            this.diamondLabel.string = this.playerDiamonds.toString();
            if (animate) this.playScoreAnimation(this.diamondLabel.node);
        }
        if (this.energyLabel) {
            this.energyLabel.string = this.playerEnergy.toString();
            if (animate) this.playScoreAnimation(this.energyLabel.node);
        }
    }
    
    private playScoreAnimation(targetLabelNode: Node, isError: boolean = false) {
        if (!targetLabelNode) return;
        tween(targetLabelNode).stop();
        targetLabelNode.setScale(Vec3.ONE);
        const label = targetLabelNode.getComponent(Label);
        if(!label) return;
        const originalColor = label.color.clone();
        if(isError) {
            tween(targetLabelNode).call(() => { label.color = Color.RED; })
                .by(0.05, { position: v3(10, 0, 0) }).by(0.05, { position: v3(-20, 0, 0) })
                .by(0.05, { position: v3(10, 0, 0) }).call(() => { label.color = originalColor; }).start();
        } else {
            tween(targetLabelNode).to(0.15, { scale: v3(1.4, 1.4, 1) }, { easing: 'quadOut' })
                .to(0.2, { scale: Vec3.ONE }, { easing: 'bounceOut' }).start();
        }
    }

    updateCollectionProgress(categoryName: string) {
        const goal = this.collectionGoals.find(g => g.categoryName === categoryName);
        if (!goal) return;
        const trackerUI = this.collectionTrackers.find(t => t.categoryName === categoryName);
        if (!trackerUI) return;
        
        const progressSet = this.collectionProgress.get(categoryName) || new Set();
        const completionRatio = goal.requiredItemIds.length > 0 ? progressSet.size / goal.requiredItemIds.length : 0;
        
        // Track progress milestones (only first time crossing each threshold)
        if (completionRatio >= 0.25 && completionRatio < 0.5) {
            Analytics.instance?.dispatchEvent(analyticsEvents.CHALLENGE_PASS_25);
        } else if (completionRatio >= 0.5 && completionRatio < 0.75) {
            Analytics.instance?.dispatchEvent(analyticsEvents.CHALLENGE_PASS_50);
        } else if (completionRatio >= 0.75 && completionRatio < 1.0) {
            Analytics.instance?.dispatchEvent(analyticsEvents.CHALLENGE_PASS_75);
        }
        
        if (progressSet.size >= goal.requiredItemIds.length && !goal.isComplete) {
            goal.isComplete = true;
            trackerUI.setStateCompleted();
            this.scheduleOnce(() => { if (trackerUI.isValid) trackerUI.playCompletionAnimationAndHide(); }, 0.5);
            this.checkStageProgression();
        }
    }

    private getActiveIncompleteGoalIndexes(): number[] {
        const indexes: number[] = [];

        for (let i = 0; i < this.collectionGoals.length; i++) {
            const goal = this.collectionGoals[i];
            if (!goal || goal.isComplete || this.getMissingItemIds(goal).length === 0) continue;

            indexes.push(i);
            if (indexes.length >= this.ACTIVE_COLLECTION_COUNT) break;
        }

        return indexes;
    }

    private refreshCollectionTrackerStates(): void {
        const activeGoalIndexes = new Set(this.getActiveIncompleteGoalIndexes());

        this.collectionTrackers.forEach((tracker, index) => {
            if (!tracker?.node) return;
            const goal = this.collectionGoals[index];
            if (!goal || goal.isComplete) return;

            if (activeGoalIndexes.has(index)) {
                tracker.setStateActive(false);
            } else {
                tracker.setStateLocked();
            }
        });
    }
    
    private checkStageProgression() {
        const allGoalsComplete = this.collectionGoals.every(g => g.isComplete);
        if (allGoalsComplete && !this.isWaitingForFinalMerge) {
            this.isWaitingForFinalMerge = true;
            console.log("All collections complete! Waiting for one last merge to end the game.");

            this.isGameStarted = false; 
            if (this.timerLabel) {
                this.timerLabel.color = new Color(120, 255, 120);
            }

            this.scheduleOnce(() => {
                 this.tryStartHandTutorial();
            }, 0.5);

            return;
        }

        this.refreshCollectionTrackerStates();
    }

    private setupInitialClickTutorial(targetButton: Node) {
        if (!this.tutorialSpotlightOverlay || !this.tutorialController || !targetButton.parent) return;
        
        this.isInitialClickTutorialActive = true;
        this.isTutorialActive = true; 
        
        this.tutorialController.node.active = true;
        this.originalClickTutorialParent = targetButton.parent;
        this.originalClickTutorialSiblingIndex = targetButton.getSiblingIndex();
        this.originalClickTutorialLayout = this.originalClickTutorialParent.getComponent(Layout);
        if (this.originalClickTutorialLayout) {
            this.originalClickTutorialLayout.enabled = false;
        }
        this.reparentItemToOverlay(targetButton);
        if (this.spotlightGlow1) {
            this.spotlightGlow1.active = true;
            this.spotlightGlow1.setPosition(targetButton.position);
        }
        this.tutorialSpotlightOverlay.active = true;
        this.tutorialController.playClickTutorial(targetButton);

        if (this.clickTutorialTextContainer) {
            this.clickTutorialTextContainer.active = true;
            this.clickTutorialTextContainer.setSiblingIndex(999);
            
            const opacity = this.clickTutorialTextContainer.getComponent(UIOpacity)!;
            tween(opacity).to(0.3, { opacity: 255 }).start();

            tween(this.clickTutorialTextContainer)
                .sequence(
                    tween().to(0.7, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'quadInOut' }),
                    tween().to(0.7, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'quadInOut' })
                )
                .repeatForever()
                .start();
        }
    }

    private cleanupInitialClickTutorial() {
        if (this.clickTutorialTextContainer) {
            Tween.stopAllByTarget(this.clickTutorialTextContainer);

            const opacity = this.clickTutorialTextContainer.getComponent(UIOpacity);
            if (opacity) {
                tween(opacity).to(0.2, { opacity: 0 })
                    .call(() => { 
                        if (this.clickTutorialTextContainer) {
                            this.clickTutorialTextContainer.active = false;
                            this.clickTutorialTextContainer.setScale(Vec3.ONE);
                        }
                    })
                    .start();
            } else {
                this.clickTutorialTextContainer.active = false;
                this.clickTutorialTextContainer.setScale(Vec3.ONE);
            }
        }
        
        if (!this.isInitialClickTutorialActive) return;
        
        this.isInitialClickTutorialActive = false;
        this.isTutorialActive = false;
        
        this.tutorialController?.stopTutorial();
        const tutorialButton = this.tutorialSpotlightOverlay?.children.find(child => child.getComponent(CollectionTrackerUI));
        if(tutorialButton && this.originalClickTutorialParent) {
            const worldPos = this.tutorialSpotlightOverlay!.getComponent(UITransform)!.convertToWorldSpaceAR(tutorialButton.position);
            tutorialButton.setParent(this.originalClickTutorialParent);
            tutorialButton.setPosition(this.originalClickTutorialParent.getComponent(UITransform)!.convertToNodeSpaceAR(worldPos));
            tutorialButton.setSiblingIndex(this.originalClickTutorialSiblingIndex);
            if (this.originalClickTutorialLayout) {
                this.originalClickTutorialLayout.enabled = true;
                this.originalClickTutorialLayout.updateLayout(); 
            }
        }

        if (this.spotlightGlow1) this.spotlightGlow1.active = false;
        if (this.tutorialSpotlightOverlay) this.tutorialSpotlightOverlay.active = false;
        this.originalClickTutorialParent = null;
        this.originalClickTutorialLayout = null;
    }

    private playTimerRewardAnimation() {
        if (!this.timerLabel?.node) return;
        const timerNode = this.timerLabel.node; const originalColor = this.timerLabel.color.clone(); const rewardColor = new Color(120, 255, 120);
        tween(timerNode).stop().to(0.15, { scale: new Vec3(1.4, 1.4, 1) }, { easing: 'quadOut' })
            .call(() => { if (this.timerLabel) this.timerLabel.color = rewardColor; })
            .to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'bounceOut' })
            .call(() => { if (this.timerLabel) { tween(this.timerLabel.color).to(0.5, { r: originalColor.r, g: originalColor.g, b: originalColor.b, a: originalColor.a }).start(); } }).start();
    }
    
    private showTimeRewardText() {
        if (!this.uiCanvas || !this.timerLabel) return;
        this.timeRemaining += 3;
        this.timerLabel.string = this.formatTime(this.timeRemaining);
        this.playTimerRewardAnimation();
        const rewardNode = new Node("TimeRewardText");
        const label = rewardNode.addComponent(Label);
        label.font = this.timerLabel.font;
        label.useSystemFont = this.timerLabel.useSystemFont;
        label.string = "+3"; label.fontSize = 70; label.color = new Color(120, 255, 120);
        const outline = rewardNode.addComponent(LabelOutline);
        outline.color = Color.BLACK; outline.width = 4;
        rewardNode.setParent(this.uiCanvas);
        const timerWorldPos = this.timerLabel.node.getComponent(UITransform)!.convertToWorldSpaceAR(Vec3.ZERO);
        rewardNode.setPosition(this.uiCanvas.getComponent(UITransform)!.convertToNodeSpaceAR(timerWorldPos));
        const uiOpacity = rewardNode.addComponent(UIOpacity); uiOpacity.opacity = 0;
        tween(rewardNode).by(1.0, { position: v3(0, 100, 0) }, { easing: 'quadOut' }).call(() => { rewardNode.destroy(); }).start();
        tween(uiOpacity).to(0.1, { opacity: 255 }).delay(0.5).to(0.4, { opacity: 0 }).start();
    }
    
    runInitialTutorialStep() { 
        if (!this.isInitialTutorialActive) return; const allTutorialItems = this.itemContainer.children.filter(item => item.getComponent(ItemController)?.itemId === this.tutorialItemId);
        const outlines = allTutorialItems.filter(item => item.getComponent(ItemController)!.itemLevel === 0);
        let startNode: Node | null = null, endNode: Node | null = null;
        if (outlines.length >= 2) { [startNode, endNode] = outlines; } 
        if (startNode && endNode) { this.setupInitialTutorial(startNode, endNode); this.isTutorialActive = true; this.scheduleOnce(() => { if (this.isInitialTutorialActive && this.tutorialController) { this.tutorialController.playTutorial(startNode!, endNode!); } }, 0.5); }
        else { this.isInitialTutorialActive = false; this.tutorialController?.stopTutorial(); }
    }
    
    tryStartHandTutorial() {
        if ((this.isInitialTutorialActive || this.isTutorialActive || this.isGameOver) && !this.isWaitingForFinalMerge) return;
        this.idleTime = 0;
        let tutorialPair: Node[] | null = null;
        
        const levelOneItemsById = new Map<number, Node[]>();
        const levelZeroItemsById = new Map<number, Node[]>();
        
        this.itemContainer.children.forEach(itemNode => {
            const controller = itemNode.getComponent(ItemController);
            if (controller && itemNode.active) {
                const map = controller.itemLevel === 1 ? levelOneItemsById : levelZeroItemsById;
                if (!map.has(controller.itemId)) {
                    map.set(controller.itemId, []);
                }
                map.get(controller.itemId)!.push(itemNode);
            }
        });

        for (const nodes of levelOneItemsById.values()) {
            if (nodes.length >= 2) {
                tutorialPair = nodes.slice(0, 2);
                break;
            }
        }
        
        if (!tutorialPair) {
            for (const nodes of levelZeroItemsById.values()) {
                if (nodes.length >= 2) {
                    tutorialPair = nodes.slice(0, 2);
                    break;
                }
            }
        }

        if (tutorialPair && this.tutorialController) {
            this.setupIdleSpotlight(tutorialPair[0], tutorialPair[1]);
            this.isTutorialActive = true;
            this.tutorialController.node.active = true;
            this.tutorialController.playTutorial(tutorialPair[0], tutorialPair[1]);
        }
    }
    
    endGame(didWin: boolean) { 
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.bgmAudioSource?.stop();
        this.cleanupInitialTutorial();
        this.cleanupIdleSpotlight();
        this.cleanupInitialClickTutorial();
        if (this.timerLabel) this.timerLabel.string = "0";
        if (this.endScreenNode) {
            this.endScreenNode.active = true;
            if (this.endScreenTitleLabel) this.endScreenTitleLabel.string = didWin ? this.winMessage : this.loseMessage;
            
            // Track game outcome
            if (didWin) {
                Analytics.instance?.dispatchEvent(analyticsEvents.CHALLENGE_SOLVED);
            } else {
                Analytics.instance?.dispatchEvent(analyticsEvents.CHALLENGE_FAILED);
            }
            
            // Show endcard
            this.scheduleOnce(() => {
                Analytics.instance?.dispatchEvent(analyticsEvents.ENDCARD_SHOWN);
            }, 0.5);
        }
    }
    
    private setupInitialTutorial(startNode: Node, endNode: Node) { 
        if (!this.tutorialSpotlightOverlay) return;
        this.originalStartNodeParent = startNode.parent;
        this.reparentItemToOverlay(startNode);
        this.reparentItemToOverlay(endNode);
        if (this.spotlightGlow1) this.spotlightGlow1.setPosition(startNode.position);
        if (this.spotlightGlow2) this.spotlightGlow2.setPosition(endNode.position);
        this.tutorialSpotlightOverlay.active = true;
    }
    private cleanupInitialTutorial(mergedItem?: Node | null) {
        if (!this.originalStartNodeParent) return;
        if (mergedItem?.isValid) {
            mergedItem.setParent(this.originalStartNodeParent);
            const worldPos = this.tutorialSpotlightOverlay!.getComponent(UITransform)!.convertToWorldSpaceAR(mergedItem.position);
            mergedItem.setPosition(this.originalStartNodeParent.getComponent(UITransform)!.convertToNodeSpaceAR(worldPos));
        }
        if (this.tutorialSpotlightOverlay) this.tutorialSpotlightOverlay.active = false;
        this.isInitialTutorialActive = false;
        this.isTutorialActive = false;
        this.tutorialController?.stopTutorial();
        this.originalStartNodeParent = null;
    }
     
    private setupIdleSpotlight(item1: Node, item2: Node) {
        if (!this.tutorialSpotlightOverlay) return;
        const overlaySprite = this.tutorialSpotlightOverlay.getComponent(Sprite);
        if (overlaySprite) overlaySprite.color = new Color(0, 0, 0, this.SPOTLIGHT_DARK_OPACITY);
        this.isIdleSpotlightActive = true;
        this.idleSpotlightItems = [item1, item2];
        this.reparentItemToOverlay(item1);
        this.reparentItemToOverlay(item2);
        const item1Controller = item1.getComponent(ItemController);
        if (item1Controller?.itemLevel === 1) {
            const targetScale = new Vec3(1.15, 1.15, 1);
            tween(item1).to(0.4, { scale: targetScale }, { easing: 'backOut' }).start();
            tween(item2).to(0.4, { scale: targetScale }, { easing: 'backOut' }).start();
        }
        [this.spotlightGlow1, this.spotlightGlow2].forEach((glowNode, index) => {
            if (glowNode) {
                glowNode.active = true;
                glowNode.setPosition(index === 0 ? item1.position : item2.position);
                tween(glowNode).sequence(tween().to(0.6, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'quadInOut' }), tween().to(0.6, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'quadInOut' }))
                    .repeatForever().start();
            }
        });
        this.tutorialSpotlightOverlay.active = true;
    }
    
    private cleanupIdleSpotlight() {
        if (!this.isIdleSpotlightActive) return;
        for (const item of this.idleSpotlightItems) {
            if (item?.isValid) {
                Tween.stopAllByTarget(item);
                tween(item).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
                item.setParent(this.itemContainer); 
            }
        }
        if (this.tutorialSpotlightOverlay) this.tutorialSpotlightOverlay.active = false;
        [this.spotlightGlow1, this.spotlightGlow2].forEach(glowNode => {
            if(glowNode) { 
                Tween.stopAllByTarget(glowNode);
                glowNode.active = false;
            }
        });
        this.isIdleSpotlightActive = false;
        this.isTutorialActive = false;
        if(this.tutorialController) this.tutorialController.stopTutorial();
        this.idleSpotlightItems = [];
    }

    reparentItemToOverlay(item: Node) { 
        const overlayUIT = this.tutorialSpotlightOverlay!.getComponent(UITransform); 
        if (!overlayUIT || !item.parent) return; 
        const worldPos = item.parent.getComponent(UITransform)!.convertToWorldSpaceAR(item.position); 
        item.setParent(this.tutorialSpotlightOverlay); 
        item.setPosition(overlayUIT.convertToNodeSpaceAR(worldPos)); 
    }
    
    formatTime(seconds: number): string { 
        return Math.max(0, Math.floor(seconds)).toString(); 
    }
    
    spawnInitialItems() { 
        if (!this.initialSpawnItemIds || this.initialSpawnItemIds.length === 0) { 
            for (let i = 0; i < 6; i++) this.spawnInitialRandomOutlineItem();
            return; 
        } 
        for (const itemId of this.initialSpawnItemIds) { 
            const spawnPosition = this.getSpawningPosition(); 
            this.createItem(itemId, 0, spawnPosition); 
        }
    }

    private spawnInitialRandomOutlineItem() {
        if (this.collectionGoals.length < 2) return;
        const startingItemIds = [
            ...this.collectionGoals[0].requiredItemIds,
            ...this.collectionGoals[1].requiredItemIds
        ];
        const spawnableItemDefs = this.itemDefinitions.filter(itemDef => 
            startingItemIds.includes(itemDef.itemId)
        );
        
        if (spawnableItemDefs.length === 0) {
            console.warn("No spawnable items found in the initial active collections.");
            return;
        }
        
        const randomItemData = spawnableItemDefs[Math.floor(randomRange(0, spawnableItemDefs.length))];
        const spawnPosition = this.getSpawningPosition();
        this.createItem(randomItemData.itemId, 0, spawnPosition);
    }
    
    private getActiveIncompleteGoals(): CollectionGoal[] {
        return this.getActiveIncompleteGoalIndexes()
            .map(index => this.collectionGoals[index])
            .filter(goal => goal && !goal.isComplete && this.getMissingItemIds(goal).length > 0);
    }

    private getMissingItemIds(goal: CollectionGoal): number[] {
        const progressSet = this.collectionProgress.get(goal.categoryName) || new Set<number>();
        return goal.requiredItemIds.filter(itemId => !progressSet.has(itemId));
    }

    private countBoardItemsById(itemId: number): number {
        if (!this.itemContainer) return 0;

        return this.itemContainer.children.reduce((count, itemNode) => {
            const controller = itemNode.getComponent(ItemController);
            return controller && controller.itemId === itemId ? count + 1 : count;
        }, 0);
    }

    private chooseGoalForAutoSpawn(): CollectionGoal | null {
        const goals = this.getActiveIncompleteGoals();
        if (goals.length === 0) return null;

        goals.sort((a, b) => {
            const aMissingCount = this.getMissingItemIds(a).length;
            const bMissingCount = this.getMissingItemIds(b).length;
            return aMissingCount - bMissingCount;
        });

        return goals[0];
    }

    private chooseMissingItemIdForAutoSpawn(goal: CollectionGoal): number | null {
        const missingItemIds = this.getMissingItemIds(goal).filter(itemId =>
            this.itemDefinitions.some(def => def.itemId === itemId)
        );
        if (missingItemIds.length === 0) return null;

        missingItemIds.sort((a, b) => this.countBoardItemsById(a) - this.countBoardItemsById(b));
        const lowestBoardCount = this.countBoardItemsById(missingItemIds[0]);
        const bestItemIds = missingItemIds.filter(itemId => this.countBoardItemsById(itemId) === lowestBoardCount);

        return bestItemIds[Math.floor(randomRange(0, bestItemIds.length))];
    }
    
    private spawnAutoItem() {
        if (this.isGameOver || this.isWaitingForFinalMerge) return;
        if (!this.collectionGoals || this.collectionGoals.length === 0) {
            console.warn("spawnAutoItem: No collection goals");
            return;
        }

        const targetGoal = this.chooseGoalForAutoSpawn();
        if (!targetGoal) {
            console.warn("spawnAutoItem: No incomplete active collection to spawn for.");
            return;
        }

        const targetItemId = this.chooseMissingItemIdForAutoSpawn(targetGoal);
        if (targetItemId === null) {
            console.warn("spawnAutoItem: No missing spawnable item found for category", targetGoal.categoryName);
            return;
        }

        this.createItem(targetItemId, 0, this.getSpawningPosition());
    }
    
    getSpawningPosition(): Vec3 {
        if (!this.spawnPathXCoordinates || this.spawnPathXCoordinates.length === 0) {
            console.error("Spawn Path X Coordinates are not set in the GameManager! Defaulting to X=0.");
            return new Vec3(0, 1000, 0);
        }

        const randomIndex = Math.floor(randomRange(0, this.spawnPathXCoordinates.length));
        const spawnX = this.spawnPathXCoordinates[randomIndex];

        const itemContainerUIT = this.itemContainer.getComponent(UITransform);
        const spawnY = (itemContainerUIT?.height ?? 1000) / 2 + 500;
        
        return new Vec3(spawnX, spawnY, 0);
    }
    
    createItem(itemId: number, level: number, position: Vec3): Node | null { 
        const itemData = this.itemDefinitions.find(d => d.itemId === itemId); 
        if (!itemData) return null; 
        const itemNode = instantiate(this.itemBasePrefab); 
        const sprite = itemNode.getComponent(Sprite); 
        if (sprite) {
            if (level === 0) sprite.spriteFrame = itemData.outlineSprite; 
            else if (level === 1) sprite.spriteFrame = itemData.graySprite; 
            else if (level === 2) sprite.spriteFrame = itemData.colorSprite; 
        }
        const rb = itemNode.getComponent(RigidBody2D); 
        if(rb) { rb.linearDamping = 0.5; rb.angularDamping = 0.8; rb.gravityScale = 10; }
        
        const collider = itemNode.getComponent(BoxCollider2D); 
        if (collider) {
            this.scheduleOnce(() => { 
                if (itemNode.isValid) { 
                    const size = itemNode.getComponent(UITransform)!.contentSize; 
                    collider.size = new Size(size.width, size.height); 
                    collider.apply();
                } 
            }); 
        }
        
        const controller = itemNode.getComponent(ItemController); 
        if(controller) controller.setup(itemId, level, this); 
        this.itemContainer.addChild(itemNode); 
        itemNode.setPosition(position); 
        return itemNode; 
    }
}
