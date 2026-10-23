import { Show, onMount, type Component } from 'solid-js';
import type { ModelRoute } from 'manifest-shared';
import { sharedOwnerLabel } from '../services/api/sharing.js';
import {
  findSharedConnection,
  loadSharedConnections,
  sharedConnections,
} from '../services/shared-connections.js';

/**
 * Fork: marks a route that runs on a subscription another user shares, and
 * warns when the owner stopped sharing it (the route is then skipped and the
 * next fallback serves the request). Renders nothing for own routes.
 */
const SharedRouteChip: Component<{ route: ModelRoute | null | undefined }> = (props) => {
  onMount(() => {
    if (props.route?.sharedConnectionId) void loadSharedConnections();
  });
  const connection = () => findSharedConnection(props.route?.sharedConnectionId);
  const unavailable = () => sharedConnections() !== null && !connection();

  return (
    <Show when={props.route?.sharedConnectionId}>
      <Show
        when={!unavailable()}
        fallback={
          <span
            class="shared-chip shared-chip--unavailable"
            title="Its owner stopped sharing this subscription. Requests skip this route."
          >
            No longer shared
          </span>
        }
      >
        <span
          class="shared-chip"
          title={
            connection()
              ? `Runs on ${sharedOwnerLabel(connection()!)}'s "${connection()!.label}" subscription`
              : 'Runs on a subscription another user shares'
          }
        >
          Shared
          <Show when={connection()}>{(c) => <> · {sharedOwnerLabel(c())}</>}</Show>
        </span>
      </Show>
    </Show>
  );
};

export default SharedRouteChip;
