import { commands, events, type ReviewView } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useCallback, useEffect, useRef, useState } from "react";

export type Review =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; view: ReviewView };

/**
 * The overview from `review_get`, kept current by `review-changed`. The newest wins: a reply to a
 * read that was sent before a newer event (or a newer read) is dropped.
 */
export function useReview() {
  const [review, setReview] = useState<Review>({ status: "loading" });
  const events_ = useRef(0);
  const reads = useRef(0);
  const live = useRef(true);

  const load = useCallback((): Promise<void> => {
    const seenEvents = events_.current;
    const seq = ++reads.current;
    const stale = () => !live.current || events_.current !== seenEvents || seq !== reads.current;
    const failed = (error: unknown) => {
      console.error("review_get failed", error);
      if (!stale()) setReview({ status: "error" });
    };
    return commands.reviewGet().then((result) => {
      if (result.status === "error") return failed(result.error);
      if (!stale()) setReview({ status: "ok", view: result.data });
    }, failed);
  }, []);

  useEffect(() => {
    live.current = true;
    const stop = subscribe("review-changed", events.reviewChanged.listen, (view) => {
      events_.current += 1;
      setReview({ status: "ok", view: view as ReviewView });
    });
    load();
    return () => {
      live.current = false;
      stop();
    };
  }, [load]);

  /** Reads again, from the failure line's Try again. */
  const retry = useCallback(() => {
    load();
  }, [load]);

  return { review, retry };
}
