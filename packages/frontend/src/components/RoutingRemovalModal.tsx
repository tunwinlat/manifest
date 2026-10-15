import { For, Show, type Component } from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  describeRouteSurface,
  groupByHarness,
  pendingRoutingRemoval,
  type AffectedRoute,
} from '../services/routing-removal-confirm.js';

function routeOutcome(route: AffectedRoute): string | null {
  if (route.position !== 'primary') return null;
  return route.replacement
    ? `${route.replacement} becomes the primary model`
    : 'no fallback left; Manifest picks a model automatically';
}

/**
 * Shown when a disconnect would remove models from routing. Lists every
 * affected harness and route; "Remove and disconnect" retries the disconnect
 * with those routes removed. Driven by `confirmRoutingRemoval()`, mounted once.
 */
const RoutingRemovalModal: Component = () => {
  const harnessCount = () => groupByHarness(pendingRoutingRemoval()?.affected ?? []).length;

  return (
    <Portal>
      <Show when={pendingRoutingRemoval()}>
        {(pending) => (
          <div class="modal-overlay" onClick={() => pending().resolve(false)}>
            <div
              class="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="routing-removal-title"
              style="max-width: 520px;"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') pending().resolve(false);
              }}
            >
              <h2 class="modal-card__title" id="routing-removal-title">
                Remove models from routing?
              </h2>
              <p class="modal-card__desc">
                This connection's models are used in {harnessCount()}{' '}
                {harnessCount() === 1 ? 'harness' : 'harnesses'}. Disconnecting removes them from
                these routes:
              </p>

              <ul class="routing-removal__list" aria-label="Routes that will be removed">
                <For each={groupByHarness(pending().affected)}>
                  {([harness, routes]) => (
                    <li class="routing-removal__harness">
                      <div class="routing-removal__harness-name">{harness}</div>
                      <ul class="routing-removal__routes">
                        <For each={routes}>
                          {(route) => (
                            <li class="routing-removal__route">
                              {describeRouteSurface(route)} · {route.position} ·{' '}
                              <span class="routing-removal__model">{route.model}</span>
                              <Show when={routeOutcome(route)}>
                                {(outcome) => <> ({outcome()})</>}
                              </Show>
                            </li>
                          )}
                        </For>
                      </ul>
                    </li>
                  )}
                </For>
              </ul>

              <div class="confirm-modal__footer">
                <button class="btn btn--ghost btn--sm" onClick={() => pending().resolve(false)}>
                  Cancel
                </button>
                <button class="btn btn--danger btn--sm" onClick={() => pending().resolve(true)}>
                  Remove and disconnect
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </Portal>
  );
};

export default RoutingRemovalModal;
