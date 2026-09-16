'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import {
  getBusinessHours, upsertBusinessHours, getBusinessStatus,
  getHolidays, addHoliday, deleteHoliday,
} from '@/lib/data/vendor-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { DAYS_OF_WEEK } from '@/lib/types/vendor';
import type { BusinessHour } from '@/lib/types/vendor';
import { Clock, Save, Loader2, Trash2, Plus, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function BusinessHoursPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <HoursContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function HoursContent() {
  const { vendor, loading } = useVendor();
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [holidays, setHolidays] = useState<{ id: string; holiday_date: string; description: string | null }[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', description: '' });

  useEffect(() => {
    if (!vendor) return;
    loadData();
  }, [vendor]);

  async function loadData() {
    if (!vendor) return;
    setDataLoading(true);
    const [h, hol] = await Promise.all([getBusinessHours(vendor.id), getHolidays(vendor.id)]);
    setHours(h);

    // Fill in missing days
    const fullHours: BusinessHour[] = DAYS_OF_WEEK.map((_, day) => {
      const existing = h.find(hh => hh.day_of_week === day);
      return existing || {
        id: '',
        vendor_id: vendor.id,
        day_of_week: day,
        is_open: false,
        open_time: '08:00',
        close_time: '17:00',
      };
    });
    setHours(fullHours);
    setHolidays(hol);
    setDataLoading(false);
  }

  const updateHour = (day: number, field: 'is_open' | 'open_time' | 'close_time', value: string | boolean) => {
    setHours(prev => prev.map(h => h.day_of_week === day ? { ...h, [field]: value } : h));
  };

  const handleSave = async () => {
    if (!vendor) return;
    setSaving(true);
    const { error } = await upsertBusinessHours(vendor.id, hours.map(h => ({
      day_of_week: h.day_of_week,
      is_open: h.is_open,
      open_time: h.open_time,
      close_time: h.close_time,
    })));
    if (error) { toast.error(error); }
    else { toast.success('Business hours saved'); loadData(); }
    setSaving(false);
  };

  const handleAddHoliday = async () => {
    if (!vendor || !newHoliday.date) { toast.error('Please select a date'); return; }
    const { error } = await addHoliday(vendor.id, {
      holiday_date: newHoliday.date,
      description: newHoliday.description || undefined,
    });
    if (error) { toast.error(error); }
    else {
      toast.success('Holiday added');
      setNewHoliday({ date: '', description: '' });
      loadData();
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    const { error } = await deleteHoliday(id);
    if (error) { toast.error(error); } else { toast.success('Holiday removed'); loadData(); }
  };

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </VendorDashboardLayout>
    );
  }

  const currentStatus = getBusinessStatus(hours, vendor?.is_temporarily_closed || false);

  return (
    <VendorDashboardLayout
      vendorName={vendor?.business_name || ''}
      isVerified={vendor?.is_verified || false}
      subscriptionStatus=""
    >
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Business Hours</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set when your business is open so students know when to visit.</p>
      </div>

      {/* Current status */}
      <Card className="mb-6">
        <CardContent className="flex items-center gap-4 p-5">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
            currentStatus.status === 'open' ? 'bg-success/10 text-success' :
            currentStatus.status === 'closing_soon' ? 'bg-warning/10 text-warning' :
            'bg-destructive/10 text-destructive'
          }`}>
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">{currentStatus.label}</p>
            <p className="text-sm text-muted-foreground">
              {currentStatus.status === 'open' ? 'Students can visit you right now.' :
               currentStatus.status === 'closing_soon' ? 'Make sure to wrap up soon.' :
               'You are currently closed.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Hours editor */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Weekly Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {hours.map((hour) => (
                <div key={hour.day_of_week} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
                  <div className="flex items-center justify-between gap-3 sm:w-32">
                    <span className="text-sm font-medium text-foreground">{DAYS_OF_WEEK[hour.day_of_week]}</span>
                    <Switch
                      checked={hour.is_open}
                      onCheckedChange={v => updateHour(hour.day_of_week, 'is_open', v)}
                    />
                  </div>
                  {hour.is_open ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={hour.open_time || '08:00'}
                        onChange={e => updateHour(hour.day_of_week, 'open_time', e.target.value)}
                        className="w-28"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={hour.close_time || '17:00'}
                        onChange={e => updateHour(hour.day_of_week, 'close_time', e.target.value)}
                        className="w-28"
                      />
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground w-fit">Closed</Badge>
                  )}
                </div>
              ))}
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Hours'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Holidays */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Holidays & Closures</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="holiday_date">Add a holiday</Label>
                <Input
                  id="holiday_date"
                  type="date"
                  value={newHoliday.date}
                  onChange={e => setNewHoliday(p => ({ ...p, date: e.target.value }))}
                />
                <Input
                  placeholder="Description (optional)"
                  value={newHoliday.description}
                  onChange={e => setNewHoliday(p => ({ ...p, description: e.target.value }))}
                />
                <Button onClick={handleAddHoliday} size="sm" className="w-full">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Holiday
                </Button>
              </div>

              {holidays.length > 0 ? (
                <div className="space-y-2">
                  {holidays.map(h => (
                    <div key={h.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
                      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {new Date(h.holiday_date).toLocaleDateString('en-GH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        {h.description && <p className="text-xs text-muted-foreground truncate">{h.description}</p>}
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteHoliday(h.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">No holidays scheduled</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </VendorDashboardLayout>
  );
}
