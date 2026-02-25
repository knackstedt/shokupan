import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const store = globalThis.localStorage || {};
const matchMedia = globalThis.matchMedia || (() => ({})) as any;

type AppTheme = "light" | "dark" | 'auto';

const verifyTheme = (theme: string) => {
    if (theme == 'dark' || theme == 'light')
        return theme;
    return 'auto';
};
const initialTheme = verifyTheme(store['fiq.theme']);
const initialDiscreteTheme = initialTheme != 'auto'
    ? initialTheme
    : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
const getAutoTheme = () => {
    return matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
};

@Injectable({
    providedIn: 'root'
})
export class ThemeService {

    readonly themes = [
        { label: "Dark", id: 'dark' },
        { label: "Light", id: 'light' },
        { label: "Automatic", id: 'auto' },
    ];

    selectedTheme = initialTheme;

    /**
     * This theme will always only be 'dark' or 'light'.
     * For use with canvases and similar libraries.
     */
    theme = new BehaviorSubject<'dark' | 'light'>(initialDiscreteTheme);

    constructor() {

        this.theme.subscribe(t => {
            document.body.parentElement?.classList.remove("theme-dark");
            document.body.parentElement?.classList.remove("theme-light");
            document.body.parentElement?.classList.add("theme-" + t);
        });

        // The system theme changed (either due to timed color themes or the user changing the mode)
        matchMedia('(prefers-color-scheme: dark)').addEventListener("change", ev => {
            if (store['fiq.theme'] == "auto")
                this.theme.next(getAutoTheme());
        });
    }

    public setTheme(t: AppTheme) {
        const theme = verifyTheme(t);
        store['fiq.theme'] = theme;
        this.selectedTheme = theme;

        if (theme == 'auto') {
            this.theme.next(getAutoTheme());
        }
        else {
            this.theme.next(theme);
        }
    }
}
