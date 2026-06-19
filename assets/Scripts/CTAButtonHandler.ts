// FILE: /assets/Scripts/CTAButtonHandler.ts

import { _decorator, Component, AudioSource, find } from 'cc';
import { Analytics, analyticsEvents } from './Analytics';
declare const super_html_playable: any;
declare const window: any;
const { ccclass } = _decorator;

@ccclass('CTAButtonHandler')
export class CTAButtonHandler extends Component {
    private adHandler: any = null;
    private readonly STORE_URL = "https://play.google.com/store/apps/details?id=com.game.goolny.stickers";

    onLoad() {
        if (typeof super_html_playable !== 'undefined') {
            this.adHandler = new super_html_playable();
            console.log("Ad network library (super_html_playable) initialized successfully.");
        } else {
            console.warn("Ad network library not found. Will use Google Exit API or fallback.");
        }
    }

    public onStoreButtonClicked(): void {
        console.log("Store button clicked!");
        
        // Track CTA click
        Analytics.instance?.dispatchEvent(analyticsEvents.CTA_CLICKED);
        
        // Find main audio source to stop music on click
        const mainAudio = find("Canvas-001/GameCamera")?.getComponent(AudioSource);
        if (mainAudio) {
            mainAudio.stop();
        }
        
        // Try AppLovin handler first
        if (this.adHandler && typeof this.adHandler.download === 'function') {
            console.log("Using AppLovin download handler...");
            this.adHandler.download();
            return;
        }
        
        // Try Google Exit API (MRAID)
        if (typeof window.mraid !== 'undefined' && window.mraid.open) {
            console.log("Using MRAID open for Google Play Store...");
            window.mraid.open(this.STORE_URL);
            return;
        }
        
        // Try Google Play API direct
        if (typeof window.googlePlayApi !== 'undefined') {
            console.log("Using Google Play API...");
            window.googlePlayApi.openStore(this.STORE_URL);
            return;
        }
        
        // Fallback: Open in browser
        console.log("FALLBACK: Opening store in browser window...");
        window.open(this.STORE_URL, "_blank");
    }
}