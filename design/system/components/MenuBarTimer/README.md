Time that is always visible: the menu-bar item and the floating mini timer.

- `compact` (default `true`): digits plus a mode shape, nothing else; the menu bar has no room for a task. `compact: false` is the floating window: `timer-md` digits and the task.
- `remaining`, `remainingLabel`, `progress` and `mode` as in `TimerRing`. Focus shows a small draining ring; `warning` shows the triangle, `break` the half circle, `paused` the bars, `idle` the hollow circle with no digits.
- `task` is always part of the spoken name, even when compact.

Do: keep it informational (`role="timer"`); the host wraps it in its own menu control. Don't: invent digits when there is no session.
