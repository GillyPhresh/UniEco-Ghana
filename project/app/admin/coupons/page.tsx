'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getAdminCoupons, createCoupon, updateCoupon, deleteCoupon } from '@/lib/data/payment-client';
import type { Coupon } from '@/lib/types/payment';
import { Ticket, Plus, Edit, Trash2, Eye, EyeOff, Percent, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminCouponsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState<{
    code: string; description: string; discount_type: 'percentage' | 'fixed';
    discount_value: number; min_order_amount: number; max_discount_amount: number;
    student_only: boolean; usage_limit: number; per_user_limit: number; is_active: boolean;
  }>({
    code: '', description: '', discount_type: 'percentage', discount_value: 10,
    min_order_amount: 0, max_discount_amount: 0, student_only: false,
    usage_limit: 100, per_user_limit: 1, is_active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCoupons(); }, []);

  async function loadCoupons() {
    setLoading(true);
    const data = await getAdminCoupons();
    setCoupons(data);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ code: '', description: '', discount_type: 'percentage', discount_value: 10, min_order_amount: 0, max_discount_amount: 0, student_only: false, usage_limit: 100, per_user_limit: 1, is_active: true });
    setShowDialog(true);
  }

  function openEdit(c: Coupon) {
    setEditing(c);
    setForm({
      code: c.code, description: c.description || '', discount_type: c.discount_type as 'percentage' | 'fixed',
      discount_value: c.discount_value, min_order_amount: c.min_order_amount,
      max_discount_amount: c.max_discount_amount || 0, student_only: c.student_only,
      usage_limit: c.usage_limit || 100, per_user_limit: c.per_user_limit, is_active: c.is_active,
    });
    setShowDialog(true);
  }

  const handleSave = async () => {
    if (!form.code) { toast.error('Coupon code is required'); return; }
    setSaving(true);
    const payload = {
      ...form,
      max_discount_amount: form.max_discount_amount || undefined,
      usage_limit: form.usage_limit || undefined,
    };
    if (editing) {
      const { error } = await updateCoupon(editing.id, payload);
      if (error) { toast.error(error); } else { toast.success('Coupon updated'); setShowDialog(false); loadCoupons(); }
    } else {
      const { error } = await createCoupon(payload);
      if (error) { toast.error(error); } else { toast.success('Coupon created'); setShowDialog(false); loadCoupons(); }
    }
    setSaving(false);
  };

  const handleDelete = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.code}"?`)) return;
    const { error } = await deleteCoupon(c.id);
    if (error) { toast.error(error); } else { toast.success('Coupon deleted'); loadCoupons(); }
  };

  const handleToggle = async (c: Coupon) => {
    const { error } = await updateCoupon(c.id, { is_active: !c.is_active });
    if (error) { toast.error(error); } else { loadCoupons(); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" /> Coupons & Vouchers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{coupons.length} coupons</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add coupon</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : coupons.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No coupons yet</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {coupons.map(c => (
            <Card key={c.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.discount_type === 'percentage' ? 'bg-primary/10' : 'bg-accent/10'}`}>
                  {c.discount_type === 'percentage' ? <Percent className="h-5 w-5 text-primary" /> : <DollarSign className="h-5 w-5 text-accent" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono font-semibold text-foreground">{c.code}</p>
                    {c.student_only && <Badge variant="outline" className="text-xs">Student only</Badge>}
                    {!c.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.discount_type === 'percentage' ? `${c.discount_value}% off` : `GH₵${c.discount_value} off`}
                    {c.description && ` — ${c.description}`}
                    {' '} | Used: {c.usage_count}{c.usage_limit ? `/${c.usage_limit}` : ''}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleToggle(c)}>{c.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Coupon' : 'Add Coupon'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="SAVE20" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Discount Type</Label>
                <div className="flex gap-1.5">
                  <Button size="sm" variant={form.discount_type === 'percentage' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setForm(p => ({ ...p, discount_type: 'percentage' }))}>Percentage</Button>
                  <Button size="sm" variant={form.discount_type === 'fixed' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setForm(p => ({ ...p, discount_type: 'fixed' }))}>Fixed</Button>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Discount Value</Label><Input type="number" value={form.discount_value} onChange={e => setForm(p => ({ ...p, discount_value: Number(e.target.value) }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Min Order Amount</Label><Input type="number" value={form.min_order_amount} onChange={e => setForm(p => ({ ...p, min_order_amount: Number(e.target.value) }))} /></div>
              <div className="space-y-1.5"><Label>Max Discount</Label><Input type="number" value={form.max_discount_amount} onChange={e => setForm(p => ({ ...p, max_discount_amount: Number(e.target.value) }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Usage Limit</Label><Input type="number" value={form.usage_limit} onChange={e => setForm(p => ({ ...p, usage_limit: Number(e.target.value) }))} /></div>
              <div className="space-y-1.5"><Label>Per User Limit</Label><Input type="number" value={form.per_user_limit} onChange={e => setForm(p => ({ ...p, per_user_limit: Number(e.target.value) }))} /></div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.student_only} onChange={e => setForm(p => ({ ...p, student_only: e.target.checked }))} /> Student only</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} /> Active</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button disabled={saving} onClick={handleSave}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
