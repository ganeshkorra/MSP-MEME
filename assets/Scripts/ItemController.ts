import { _decorator, Component, Node, input, Input, EventTouch, Vec3, UITransform, RigidBody2D, ERigidBody2DType, tween, BoxCollider2D, Tween, Sprite, Color } from 'cc';
import { GameManager } from './GameManager';

const { ccclass } = _decorator;

@ccclass('ItemController')
export class ItemController extends Component {
    public itemId: number = -1;
    public itemLevel: number = 0;
    public gameManager: GameManager = null;
    private isDragging: boolean = false;
    private startPosition: Vec3 = new Vec3();
    public isMerging: boolean = false;
    private ghostNode: Node | null = null;

    public setup(id: number, level: number, manager: GameManager) {
        this.itemId = id; this.itemLevel = level; this.gameManager = manager;
    }

    onLoad() {
        this.node.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Input.EventType.TOUCH_END, this.onDrop, this);
        this.node.on(Input.EventType.TOUCH_CANCEL, this.onDrop, this);
    }

    onTouchStart(event: EventTouch) {
        if (this.gameManager.isGameOver || this.isMerging || !this.enabled) return;
        this.gameManager.playerDidStartDrag();
        this.isDragging = true; this.startPosition.set(this.node.position);

        this.node.getComponent(RigidBody2D)!.enabled = false;
        this.getComponent(BoxCollider2D)!.enabled = false;
        this.node.setSiblingIndex(999);

        // --- Ghost Blocker Logic ---
        if (!this.ghostNode) {
            this.ghostNode = new Node('BlockerGhost');
            const originalSprite = this.node.getComponent(Sprite);
            if (originalSprite) {
                const ghostSprite = this.ghostNode.addComponent(Sprite);
                ghostSprite.spriteFrame = originalSprite.spriteFrame;
                ghostSprite.color = new Color(255, 255, 255, 80); // Transparent
            }
            const ghostRB = this.ghostNode.addComponent(RigidBody2D);
            ghostRB.type = ERigidBody2DType.Static;

            const collider = this.getComponent(BoxCollider2D);
            if (collider) {
                const ghostCollider = this.ghostNode.addComponent(BoxCollider2D);
                ghostCollider.size = collider.size;
                ghostCollider.offset = collider.offset;
                ghostCollider.apply();
            }
            this.node.parent.addChild(this.ghostNode);
            this.ghostNode.setPosition(this.startPosition);
        }
    }

    onTouchMove(event: EventTouch) {
        if (!this.isDragging) return;
        this.node.position = this.node.position.add3f(event.getUIDelta().x, event.getUIDelta().y, 0);
    }
    
    onDrop() {
        if (!this.isDragging) return;
        this.isDragging = false;
        if (!this.node?.isValid) return;

        let didMerge = false;
        const myBox = this.getComponent(UITransform)!.getBoundingBoxToWorld();

        for (const otherNode of this.node.parent.children) {
            const otherController = otherNode.getComponent(ItemController);
            if (!otherController || otherNode === this.node) continue;
            
            if (otherController.itemId === this.itemId && otherController.itemLevel === this.itemLevel) {
                const otherBox = otherNode.getComponent(UITransform)!.getBoundingBoxToWorld();
                if (myBox.intersects(otherBox) && !this.isMerging && !otherController.isMerging) {
                    this.isMerging = true; otherController.isMerging = true; didMerge = true;
                    
                    const mergePosition = this.node.position.clone().add(otherNode.position).multiplyScalar(0.5);

                    tween(this.node).to(0.1, { scale: Vec3.ZERO }, { easing: 'backIn' }).call(() => {
                        this.gameManager.handleMerge(this.itemId, this.itemLevel, mergePosition);
                        this.node.destroy();
                        otherNode.destroy();
                    }).start();
                    tween(otherNode).to(0.1, { scale: Vec3.ZERO }, { easing: 'backIn' }).start();
                    break; 
                }
            }
        }

        if (!didMerge && this.node?.isValid) {
            tween(this.node).to(0.2, { position: this.startPosition }, { easing: 'cubicOut' }).call(() => {
                if (this.node?.isValid) {
                    this.getComponent(BoxCollider2D)!.enabled = true;
                    this.node.getComponent(RigidBody2D)!.enabled = true;
                }
            }).start();
        }

        if (this.ghostNode && this.ghostNode.isValid) {
            this.ghostNode.destroy();
            this.ghostNode = null;
        }
    }
}