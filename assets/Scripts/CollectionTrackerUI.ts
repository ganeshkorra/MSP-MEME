import { _decorator, Component, Node, Label, UITransform, tween, Vec3, UIOpacity, Color, Button, Tween } from 'cc';
import { GameManager } from './GameManager';

const { ccclass, property } = _decorator;

@ccclass('CollectionTrackerUI')
export class CollectionTrackerUI extends Component {
    @property({ type: Label }) public progressLabel: Label = null;
    @property({ type: Node }) public progressBarFilledNode: Node = null;
    @property({ type: Node }) public lockIcon: Node | null = null;
    @property({ type: Node }) public checkmarkIcon: Node | null = null;

    public gameManager: GameManager | null = null;
    public categoryName: string = "";
    private uiOpacity: UIOpacity = null;
    private sceneOpacity: number = 255;
    private progressBarWidth: number = 0;
    private pulseAnimation: Tween<Node> | null = null;

    onLoad() {
        this.uiOpacity = this.getComponent(UIOpacity) ?? this.addComponent(UIOpacity);
        this.sceneOpacity = this.uiOpacity.opacity;
        if (this.progressBarFilledNode) {
            this.progressBarWidth = this.progressBarFilledNode.getComponent(UITransform)!.width;
        }
        if (this.lockIcon) this.lockIcon.active = false;
        if (this.checkmarkIcon) this.checkmarkIcon.active = false;

        this.node.on(Button.EventType.CLICK, this.onTrackerClicked, this);
    }

    private onTrackerClicked(): void {
        // Tap to spawn disabled - items spawn automatically on merge
        // this.gameManager?.requestItemSpawn(this.categoryName);
    }

    public setStateLocked() {
        if (this.uiOpacity) this.uiOpacity.opacity = this.sceneOpacity;
        if (this.lockIcon) this.lockIcon.active = true;
    }

    public setStateActive(shouldAnimate: boolean) {
        if (this.uiOpacity) this.uiOpacity.opacity = this.sceneOpacity;
        if (this.lockIcon) this.lockIcon.active = false;
    }

    public setStateCompleted() {
        if (this.checkmarkIcon) {
            this.checkmarkIcon.active = true;
            this.checkmarkIcon.setScale(Vec3.ZERO);
            tween(this.checkmarkIcon).to(0.4, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
        }
        this.stopPulseAnimation(); // Stop pulsing when completed
    }

    public updateProgress(current: number, max: number) {
        if (this.progressLabel) this.progressLabel.string = `${current}/${max}`;
        if (this.progressBarFilledNode && this.progressBarWidth > 0) {
            const fillRatio = max > 0 ? Math.min(1, current / max) : 0;
            const targetX = -this.progressBarWidth + (this.progressBarWidth * fillRatio);
            tween(this.progressBarFilledNode).to(0.3, { position: new Vec3(targetX, 0, 0) }, { easing: 'cubicOut' }).start();
        }
    }

    public playCollectionEffect() {
        tween(this.node).to(0.1, { scale: new Vec3(1.15, 1.15, 1) }).to(0.2, { scale: Vec3.ONE }, { easing: 'bounceOut' }).start();
    }
    
    public playCompletionAnimationAndHide() {
        this.stopPulseAnimation();
        tween(this.node).stop();
        tween(this.node)
            .parallel(
                tween().to(0.4, { scale: new Vec3(0, 0, 0) }, { easing: 'backIn' }),
                tween(this.getComponent(UIOpacity)!).to(0.4, { opacity: 0 }, { easing: 'quadIn' })
            )
            .call(() => {
                this.node.active = false; 
            })
            .start();
    }
    
    // --- NEW FUNCTIONS FOR PULSING ANIMATION ---
    public startPulseAnimation() {
        if (this.pulseAnimation) return; // Don't start if already running
        this.node.setScale(Vec3.ONE);
        this.pulseAnimation = tween(this.node)
            .to(0.7, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'quadInOut' })
            .to(0.7, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'quadInOut' })
            .union()
            .repeatForever()
            .start();
    }

    public stopPulseAnimation() {
        if (this.pulseAnimation) {
            this.pulseAnimation.stop();
            this.pulseAnimation = null;
            // Gently tween back to the original scale
            tween(this.node).to(0.2, { scale: Vec3.ONE }, { easing: 'quadOut' }).start();
        }
    }
}
