<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- App renders inside a 9:16 .app-shell and Tailwind breakpoints are disabled — UI is always phone layout.
- Native Android features live in android/.../MultiCamNativePlugin.java, accessed via src/lib/native.ts — web falls back to browser APIs.
- Camera tab is a fixed full-height screen (no page scroll); extra options live in an internal scrolling sheet. Why: zero-scroll HUD requirement.
- Editor shows one timeline; lanes render only when they hold clips and clip properties appear only in the selection Inspector. Why: contextual, clutter-free editor.
- ARCHITECTURE.md is the living inventory of controls and state; update it with UI changes.
