interface ThreeDSecureDialogProps {
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}

/**
 * Stands in for the card issuer's verification page. In production the issuer
 * shows its own page (password, SMS code...); here the demo lets you pass or
 * fail the challenge with one click.
 */
export function ThreeDSecureDialog({ busy, onApprove, onDecline }: ThreeDSecureDialogProps) {
  return (
    <div className="overlay">
      <div className="modal modal--sm" role="dialog" aria-modal="true" aria-labelledby="threeds-title">
        <h2 id="threeds-title">Verify this payment</h2>
        <p className="modal__lead">Your bank needs to confirm it's really you before this purchase goes through.</p>
        <div className="notice notice--info">Simulated bank verification. In a live store this would be your bank's own page.</div>
        <div className="modal__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={onApprove} disabled={busy}>
            {busy ? "Confirming…" : "Approve payment"}
          </button>
          <button type="button" className="btn btn--secondary btn--lg" onClick={onDecline} disabled={busy}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
