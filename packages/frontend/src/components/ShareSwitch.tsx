import { createSignal, type Component } from 'solid-js';
import { setConnectionSharing } from '../services/api/sharing.js';
import { toast } from '../services/toast-store.js';

interface ShareSwitchProps {
  connectionId: string;
  label: string;
  shared: boolean;
}

/**
 * Fork: offers one subscription connection to the install's other users.
 * When on, its models appear in their harness routing pickers; the credential
 * itself never leaves the owner's account.
 */
/**
 * Toggles made on this page, by connection id. The provider table rebuilds
 * its rows whenever its data recomputes (usage arriving, a rename), so the
 * switch's state has to outlive the row component that rendered it.
 */
const [overrides, setOverrides] = createSignal<Record<string, boolean>>({});

const ShareSwitch: Component<ShareSwitchProps> = (props) => {
  const shared = () => overrides()[props.connectionId] ?? props.shared;
  const setShared = (value: boolean) =>
    setOverrides((prev) => ({ ...prev, [props.connectionId]: value }));
  const [busy, setBusy] = createSignal(false);

  const toggle = async (event: MouseEvent) => {
    event.stopPropagation();
    const next = !shared();
    setBusy(true);
    try {
      await setConnectionSharing(props.connectionId, next);
      setShared(next);
      toast.success(
        next
          ? `${props.label} is now shared with other users`
          : `${props.label} is no longer shared`,
      );
    } catch {
      // fetchMutate already showed the error toast.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={shared()}
      aria-label={`Share ${props.label} with other users`}
      title={
        shared()
          ? 'Other users can route their harnesses through this subscription'
          : 'Only you can use this subscription'
      }
      class="settings-switch"
      classList={{ 'settings-switch--on': shared() }}
      disabled={busy()}
      onClick={(event) => void toggle(event)}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span class="settings-switch__track">
        <span class="settings-switch__thumb" />
      </span>
    </button>
  );
};

export default ShareSwitch;
