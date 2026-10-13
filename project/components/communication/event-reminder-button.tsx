'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, BellRing, Clock, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getEventReminders, setEventReminder, removeEventReminder,
} from '@/lib/data/communication-client';
import type { EventReminder } from '@/lib/types/communication';

interface EventReminderButtonProps {
  eventId: string;
  eventTitle: string;
  eventDate: string | null;
}

const REMINDER_OPTIONS = [
  { type: '24h' as const, label: '24 hours before' },
  { type: '1h' as const, label: '1 hour before' },
];

export function EventReminderButton({ eventId, eventTitle, eventDate }: EventReminderButtonProps) {
  const [reminders, setReminders] = useState<EventReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    loadReminders();
  }, [eventId]);

  async function loadReminders() {
    setLoading(true);
    const data = await getEventReminders(eventId);
    setReminders(data);
    setLoading(false);
  }

  const hasReminder = (type: string) => reminders.some((r) => r.reminder_type === type);

  const toggleReminder = async (type: '24h' | '1h') => {
    setToggling(true);
    if (hasReminder(type)) {
      const { error } = await removeEventReminder(eventId, type);
      if (error) { toast.error(error); }
      else { toast.success('Reminder removed'); }
    } else {
      const { error } = await setEventReminder({ event_id: eventId, reminder_type: type });
      if (error) { toast.error(error); }
      else { toast.success(`You will be reminded ${type === '24h' ? '24 hours' : '1 hour'} before this event`); }
    }
    await loadReminders();
    setToggling(false);
  };

  if (loading) {
    return <Button variant="outline" size="sm" disabled><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Loading reminders</Button>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {REMINDER_OPTIONS.map((opt) => {
        const active = hasReminder(opt.type);
        return (
          <Button
            key={opt.type}
            variant={active ? 'default' : 'outline'}
            size="sm"
            disabled={toggling}
            onClick={() => toggleReminder(opt.type)}
          >
            {active ? <BellRing className="mr-1.5 h-3.5 w-3.5" /> : <Bell className="mr-1.5 h-3.5 w-3.5" />}
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
