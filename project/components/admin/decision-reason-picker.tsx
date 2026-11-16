type DecisionReasonOption = {
  value: string;
  label: string;
  text: string;
};

type DecisionReasonPickerProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly DecisionReasonOption[];
  disabled?: boolean;
};

export const decisionReasonOptions = {
  studentVerification: [
    { value: 'student-verified', label: 'Approval: details checked', text: 'Submitted student details and supporting information were reviewed and accepted.' },
    { value: 'student-incomplete', label: 'Rejection: information incomplete', text: 'Required student details or supporting information are incomplete.' },
    { value: 'student-unverified', label: 'Rejection: details could not be confirmed', text: 'The institution or student details could not be confirmed from the information provided.' },
  ],
  vendorVerification: [
    { value: 'vendor-verified', label: 'Approval: business details reviewed', text: 'Business identity and required listing details were reviewed and accepted.' },
    { value: 'vendor-incomplete', label: 'Rejection: information incomplete', text: 'Required business details or supporting information are incomplete.' },
    { value: 'vendor-location', label: 'Correction: location needs attention', text: 'Please correct or clarify the submitted business location before verification.' },
    { value: 'vendor-requirements', label: 'Rejection: requirements not met', text: 'The submitted business listing does not currently meet platform requirements.' },
    { value: 'vendor-suspend', label: 'Suspension: policy concern confirmed', text: 'A policy concern was reviewed and the business account is suspended pending resolution.' },
    { value: 'vendor-restore', label: 'Restoration: requirements satisfied', text: 'The account was reviewed and restored after the outstanding requirements were satisfied.' },
  ],
  advertisement: [
    { value: 'ad-approved', label: 'Approval: content and destination reviewed', text: 'The advertisement content and destination were reviewed and meet platform requirements.' },
    { value: 'ad-content', label: 'Rejection: content needs changes', text: 'The advertisement content needs changes before it can be approved.' },
    { value: 'ad-destination', label: 'Rejection: destination could not be verified', text: 'The advertisement destination or linked business could not be verified.' },
  ],
  communityPost: [
    { value: 'post-keep', label: 'Keep: follows community guidelines', text: 'The post was reviewed and does not require removal under the community guidelines.' },
    { value: 'post-remove', label: 'Remove: guideline violation', text: 'The post violates the UniEco community guidelines.' },
    { value: 'post-private', label: 'Remove: private or sensitive information', text: 'The post exposes private or sensitive information and was removed to protect user safety.' },
    { value: 'post-spam', label: 'Remove: spam or misleading content', text: 'The post contains spam or misleading content and was removed under the community guidelines.' },
  ],
  refund: [
    { value: 'refund-approved', label: 'Approval: order and payment checked', text: 'The refund request was reviewed against the order and payment records and approved.' },
    { value: 'refund-ineligible', label: 'Rejection: request does not meet terms', text: 'The refund request does not meet the applicable refund requirements.' },
    { value: 'refund-evidence', label: 'Rejection: supporting information incomplete', text: 'There is not enough supporting information to approve this refund request.' },
  ],
  reviewModeration: [
    { value: 'review-publish', label: 'Publish: appears authentic and relevant', text: 'The review was checked and appears relevant and consistent with the review guidelines.' },
    { value: 'review-hide', label: 'Hide: needs further review', text: 'The review is hidden while its accuracy or guideline compliance is checked.' },
    { value: 'review-private', label: 'Remove: private or harmful content', text: 'The review contains private or harmful content and was removed under the platform guidelines.' },
    { value: 'review-spam', label: 'Remove: spam or unrelated content', text: 'The review is unrelated or promotional and does not meet the review guidelines.' },
  ],
  eventModeration: [
    { value: 'event-approved', label: 'Approval: details checked', text: 'The event details were reviewed and appear accurate and relevant to the selected campus.' },
    { value: 'event-dismiss', label: 'Dismiss: no violation found', text: 'The report was reviewed and no event policy violation was found.' },
    { value: 'event-hide', label: 'Hide: inaccurate or outdated details', text: 'The event details appear inaccurate or outdated and need correction before publication.' },
    { value: 'event-safety', label: 'Hide: safety or policy concern', text: 'The event was hidden while a reported safety or policy concern is reviewed.' },
  ],
  eventVisibility: [
    { value: 'event-publish', label: 'Publish: details checked', text: 'The event details were reviewed and meet publication requirements.' },
    { value: 'event-unpublish', label: 'Unpublish: details need correction', text: 'The event is no longer current or needs correction before it can remain public.' },
  ],
  campusUpdate: [
    { value: 'update-approved', label: 'Publish: source and details checked', text: 'The publisher, key details and campus relevance were checked before publication.' },
    { value: 'update-source', label: 'Reject: source could not be confirmed', text: 'The original publisher or source could not be confirmed from the available evidence.' },
    { value: 'update-details', label: 'Reject: information needs correction', text: 'The update contains unclear, outdated or unsupported information and was not published.' },
    { value: 'update-unpublish', label: 'Unpublish: information is no longer current', text: 'This published update is no longer current and has been removed from public view.' },
  ],
  universityAdmin: [
    { value: 'admin-approved', label: 'Approval: requirements met', text: 'The application was reviewed and meets the requirements for appointment.' },
    { value: 'admin-incomplete', label: 'Rejection: application incomplete', text: 'The application is missing information needed to assess the applicant.' },
    { value: 'admin-eligibility', label: 'Rejection: eligibility not confirmed', text: 'The applicant’s eligibility or experience could not be confirmed from the submitted information.' },
  ],
  businessAction: [
    { value: 'business-verified', label: 'Verification: business details reviewed', text: 'The business details and eligibility information were reviewed.' },
    { value: 'business-suspend', label: 'Suspension: policy concern confirmed', text: 'A policy concern was reviewed and the business account is suspended pending resolution.' },
    { value: 'business-restore', label: 'Restoration: requirements satisfied', text: 'The business account was reviewed and restored after the outstanding requirements were satisfied.' },
  ],
  trustSafety: [
    { value: 'safety-substantiated', label: 'Action: report substantiated', text: 'The report was reviewed and the available evidence substantiates the concern.' },
    { value: 'safety-no-violation', label: 'Dismiss: no violation found', text: 'The case was reviewed and the available evidence does not establish a policy violation.' },
    { value: 'safety-corrected', label: 'Resolved: corrective action completed', text: 'The concern was addressed through corrective action and the case is resolved.' },
    { value: 'safety-more-review', label: 'Continue review: more information needed', text: 'More information is needed before a final decision can be made.' },
  ],
  userAction: [
    { value: 'user-role', label: 'Role change: access reviewed', text: 'The requested role change was reviewed and authorized for this account.' },
    { value: 'user-suspend', label: 'Suspension: policy concern confirmed', text: 'A policy concern was reviewed and the account was suspended pending resolution.' },
    { value: 'user-restore', label: 'Reactivation: account reviewed', text: 'The account was reviewed and reactivated after the outstanding concern was resolved.' },
  ],
  studentAccount: [
    { value: 'student-suspend', label: 'Suspension: account concern confirmed', text: 'The account was reviewed and suspended pending resolution of the recorded concern.' },
    { value: 'student-restore', label: 'Reactivation: account reviewed', text: 'The account was reviewed and restored after the outstanding concern was resolved.' },
  ],
  couponChange: [
    { value: 'coupon-create', label: 'Create: approved promotion', text: 'This coupon is part of an approved promotional offer.' },
    { value: 'coupon-update', label: 'Update: offer terms reviewed', text: 'The coupon terms were updated following a review of the active offer.' },
    { value: 'coupon-expire', label: 'Deactivate: offer ended', text: 'The promotional offer has ended and the coupon is no longer active.' },
  ],
  permissionChange: [
    { value: 'permission-role', label: 'Access: aligned with role duties', text: 'Permissions were reviewed and aligned with the moderator’s approved responsibilities.' },
    { value: 'permission-reduce', label: 'Access: least-privilege adjustment', text: 'Permissions were reduced to the minimum access needed for the assigned duties.' },
    { value: 'permission-revoke', label: 'Access: remove permission', text: 'The permission was removed following an access review.' },
  ],
  platformSetting: [
    { value: 'setting-update', label: 'Setting: approved operational update', text: 'This platform setting was updated for an approved operational requirement.' },
    { value: 'setting-correct', label: 'Setting: correction after review', text: 'This setting was corrected after review of the current platform configuration.' },
    { value: 'setting-rollback', label: 'Rollback: restore previous value', text: 'The previous setting value was restored after review.' },
  ],
  announcementChange: [
    { value: 'announcement-publish', label: 'Announcement: approved communication', text: 'This announcement was prepared for an approved platform or campus communication.' },
    { value: 'announcement-update', label: 'Announcement: details updated', text: 'The announcement was updated to correct or clarify the published details.' },
    { value: 'announcement-retire', label: 'Announcement: no longer current', text: 'The announcement is no longer current and has been withdrawn from circulation.' },
  ],
  broadcastAction: [
    { value: 'broadcast-approve', label: 'Broadcast: audience and content checked', text: 'The message content, destination and intended audience were reviewed before this action.' },
    { value: 'broadcast-cancel', label: 'Broadcast: cancelled after review', text: 'The broadcast was cancelled after review of its timing, audience or content.' },
    { value: 'broadcast-retry', label: 'Broadcast: delivery retry reviewed', text: 'The delivery retry was reviewed and is appropriate for this broadcast.' },
  ],
  deleteAction: [
    { value: 'delete-duplicate', label: 'Delete: confirmed duplicate', text: 'The record was confirmed as a duplicate and removed after review.' },
    { value: 'delete-request', label: 'Delete: approved removal request', text: 'The removal request was reviewed and approved for this record.' },
    { value: 'delete-policy', label: 'Delete: policy-based removal', text: 'The record was removed following a documented policy review.' },
  ],
} as const satisfies Record<string, readonly DecisionReasonOption[]>;

export function DecisionReasonPicker({
  id,
  value,
  onChange,
  options,
  disabled = false,
}: DecisionReasonPickerProps) {
  const selected = options.find((option) => option.text === value)?.value ?? '';

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">Quick-fill a review reason</label>
      <select
        id={id}
        value={selected}
        disabled={disabled}
        onChange={(event) => {
          const option = options.find((item) => item.value === event.target.value);
          if (option) onChange(option.text);
        }}
        className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">Select a standard reason to fill in…</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">You can edit the filled-in reason below if this case needs specific details.</p>
    </div>
  );
}
