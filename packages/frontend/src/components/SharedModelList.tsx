import { For, Show, type Component } from 'solid-js';
import type { SharedConnection } from '../services/api/sharing.js';
import { sharedOwnerLabel } from '../services/api/sharing.js';
import { PROVIDERS } from '../services/providers.js';
import { providerIcon } from './ProviderIcon.js';

interface SharedModelListProps {
  connections: SharedConnection[];
  onSelect: (modelName: string, connection: SharedConnection) => void;
}

const providerName = (id: string) => PROVIDERS.find((p) => p.id === id)?.name ?? id;

/**
 * Fork: the "Shared with me" tab of the model picker. Models are grouped by
 * shared connection, because two users can share subscriptions of the same
 * provider and each one is a separate route.
 */
const SharedModelList: Component<SharedModelListProps> = (props) => (
  <div class="routing-modal__list" style="overflow-y: auto;">
    <Show
      when={props.connections.some((c) => c.models.length > 0)}
      fallback={
        <div class="routing-modal__empty">
          No other user shares a subscription yet. When someone turns on Share for one of their
          subscriptions, its models appear here.
        </div>
      }
    >
      <For each={props.connections.filter((c) => c.models.length > 0)}>
        {(connection) => (
          <>
            <div class="routing-modal__group-header">
              <span class="routing-modal__group-icon">{providerIcon(connection.provider, 16)}</span>
              <span class="routing-modal__group-name">
                {providerName(connection.provider)} · {connection.label}
              </span>
              <span class="shared-chip">Shared by {sharedOwnerLabel(connection)}</span>
            </div>
            <For each={connection.models}>
              {(model) => (
                <button
                  class="routing-modal__model"
                  onClick={() => props.onSelect(model.model_name, connection)}
                >
                  <span class="routing-modal__model-left">
                    <span class="routing-modal__model-label">
                      {model.display_name || model.model_name}
                    </span>
                  </span>
                </button>
              )}
            </For>
          </>
        )}
      </For>
    </Show>
  </div>
);

export default SharedModelList;
