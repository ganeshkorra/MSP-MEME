// FILE: /assets/Scripts/ItemData.ts

import { _decorator, Component, SpriteFrame, CCInteger, AudioClip } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('ItemData')
export class ItemData {
    @property({ 
        type: CCInteger, 
        tooltip: "The unique ID for this type of item (e.g., 101 for Grapes)." 
    })
    public itemId: number = 0;

    @property({ 
        type: SpriteFrame, 
        tooltip: "Level 0: The black and white outline sprite." 
    })
    public outlineSprite: SpriteFrame = null;

    @property({ 
        type: SpriteFrame, 
        tooltip: "Level 1: The gray-filled (or black-filled) sprite." 
    })
    public graySprite: SpriteFrame = null;

    @property({ 
        type: SpriteFrame, 
        tooltip: "Level 2: The full-color sprite." 
    })
    public colorSprite: SpriteFrame = null;
    
    @property({ 
        type: AudioClip, 
        tooltip: "Sound played when this item is CREATED from a merge (e.g., pop)." 
    })
    public mergeSound: AudioClip = null;
    
    @property({ 
        type: AudioClip, 
        tooltip: "Sound played when this final item is successfully COLLECTED in the UI." 
    })
    public collectionSound: AudioClip = null;
}