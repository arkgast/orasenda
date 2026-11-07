The full-screen session: a 560px ring with large tabular digits, the task, a small wall clock and one quiet way out.

- Takes `TimerRing` props (`remaining`, `remainingLabel`, `progress`, `mode`, `task`, `clock`) plus `onExit`.
- Escape and the single ghost "Leave full screen" open a `Dialog` ("Your focus session will keep running"). `onExit` fires only after confirmation; the host then leaves native full screen without stopping the session.
- The layout takes focus on mount so Escape works at once; margins are `space-8`, `space-4` on narrow windows.

Do: keep the menu-bar timer running underneath. Don't: add anything else to this screen.
