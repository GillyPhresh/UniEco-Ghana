'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

interface AdminDeleteConfirmationProps {
  open: boolean;
  itemName: string;
  resourceLabel: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<boolean>;
}

export function AdminDeleteConfirmation({
  open,
  itemName,
  resourceLabel,
  onOpenChange,
  onConfirm,
}: AdminDeleteConfirmationProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (saving) return;
    if (!nextOpen) {
      setReason('');
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const confirm = async () => {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) return;
    setSaving(true);
    setError(null);
    try {
      if (await onConfirm(normalizedReason)) {
        setReason('');
        onOpenChange(false);
      }
    } catch {
      setError(`Unable to delete this ${resourceLabel.toLowerCase()}. Please retry.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {resourceLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            “{itemName}” will be permanently deleted. This action cannot be undone and will be recorded in the audit history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={event => setReason(event.target.value)}
          minLength={10}
          maxLength={500}
          rows={3}
          aria-label={`Reason for deleting ${resourceLabel.toLowerCase()}`}
          placeholder="Reason required (10–500 characters)"
        />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving || reason.trim().length < 10 || reason.trim().length > 500}
            onClick={event => { event.preventDefault(); void confirm(); }}
          >
            {saving ? 'Deleting…' : `Delete ${resourceLabel}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
