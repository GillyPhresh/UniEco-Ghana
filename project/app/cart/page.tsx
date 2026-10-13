'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth/auth-context';
import {
  getCartItems, updateCartQuantity, removeFromCart, toggleSaveForLater,
  applyCouponToCart, removeCouponFromCart, calculateCartSummary,
  type CartSummary,
} from '@/lib/data/marketplace-client';
import type { CartItem, Coupon } from '@/lib/types/marketplace';
import {
  ShoppingCart, Trash2, Minus, Plus, ArrowRight, Tag, X,
  Image as ImageIcon, Wrench, Save,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CartPage() {
  return (
    <>
      <SiteHeader />
      <CartContent />
      <SiteFooter />
    </>
  );
}

function CartContent() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CartItem[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  useEffect(() => {
    if (!user) { if (!authLoading) setLoading(false); return; }
    loadCart();
  }, [user, authLoading]);

  async function loadCart() {
    setLoading(true);
    const data = await getCartItems();
    setItems(data);
    setLoading(false);
  }

  const activeItems = items.filter(i => !i.save_for_later);
  const savedItems = items.filter(i => i.save_for_later);
  const summary = calculateCartSummary(activeItems, 'pickup', 0, appliedCoupon);

  const handleQuantityChange = async (itemId: string, currentQty: number, delta: number) => {
    const newQty = currentQty + delta;
    if (newQty <= 0) return;
    const { error } = await updateCartQuantity(itemId, newQty);
    if (error) { toast.error(error); }
    else { loadCart(); }
  };

  const handleRemove = async (itemId: string) => {
    const { error } = await removeFromCart(itemId);
    if (error) { toast.error(error); }
    else { loadCart(); }
  };

  const handleSaveForLater = async (itemId: string, save: boolean) => {
    const { error } = await toggleSaveForLater(itemId, save);
    if (error) { toast.error(error); }
    else { loadCart(); }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setApplyingCoupon(true);
    const { error, coupon } = await applyCouponToCart(couponCode);
    if (error) { toast.error(error); }
    else {
      setAppliedCoupon(coupon || null);
      toast.success('Coupon applied');
    }
    setApplyingCoupon(false);
  };

  const handleRemoveCoupon = async () => {
    await removeCouponFromCart();
    setAppliedCoupon(null);
    setCouponCode('');
    toast.success('Coupon removed');
  };

  if (authLoading || loading) {
    return (
      <main className="container max-w-4xl py-6 sm:py-8 px-4 sm:px-6">
        <Skeleton className="h-8 w-32" />
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="container max-w-4xl py-6 sm:py-8 px-4 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-semibold text-foreground">Sign in to view your cart</p>
            <Button asChild className="mt-4"><Link href="/signin">Sign in</Link></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="container max-w-4xl py-6 sm:py-8 px-4 sm:px-6">
        <h1 className="font-display text-2xl font-bold text-foreground mb-6">Shopping Cart</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-semibold text-foreground">Your cart is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">Browse the marketplace to find products and services.</p>
            <Button asChild className="mt-4"><Link href="/marketplace">Browse marketplace</Link></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container max-w-4xl py-6 sm:py-8 px-4 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-foreground mb-6">Shopping Cart</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Cart items */}
        <div className="space-y-3">
          {activeItems.map(item => {
            const isProduct = !!item.product;
            const name = item.product?.name || item.service?.name || 'Unknown item';
            const price = item.product
              ? (item.product.discount_price || item.product.price)
              : item.service?.price || 0;
            const image = item.product?.image_url || item.product?.images?.[0] || item.service?.image_url || item.service?.images?.[0] || null;
            const stock = item.product?.stock ?? 0;

            return (
              <Card key={item.id}>
                <CardContent className="flex gap-3 p-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    {image ? (
                      <img src={image} alt={name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/40">
                        {isProduct ? <ImageIcon className="h-6 w-6" /> : <Wrench className="h-6 w-6" />}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                    <p className="mt-0.5 text-sm font-medium text-primary">GH₵{price}</p>
                    {isProduct && stock <= 5 && (
                      <Badge className="mt-1 bg-warning/10 text-warning text-xs">Only {stock} left</Badge>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {isProduct && (
                        <div className="flex items-center rounded-lg border border-border">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleQuantityChange(item.id, item.quantity, -1)} disabled={item.quantity <= 1}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleQuantityChange(item.id, item.quantity, 1)} disabled={item.quantity >= stock}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleSaveForLater(item.id, true)}>
                        <Save className="mr-1 h-3 w-3" /> Save for later
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemove(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">GH₵{(price * item.quantity).toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Saved items */}
          {savedItems.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">Saved for later ({savedItems.length})</h2>
              <div className="space-y-2">
                {savedItems.map(item => {
                  const name = item.product?.name || item.service?.name || 'Unknown item';
                  const price = item.product?.price || item.service?.price || 0;
                  const image = item.product?.image_url || item.service?.image_url || null;
                  return (
                    <Card key={item.id}>
                      <CardContent className="flex items-center gap-3 p-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                          {image && <img src={image} alt={name} className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{name}</p>
                          <p className="text-xs text-primary">GH₵{price}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleSaveForLater(item.id, false)}>
                          Move to cart
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemove(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div>
          <Card className="sticky top-20">
            <CardContent className="p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-foreground">Order Summary</h2>

              {/* Coupon */}
              {appliedCoupon ? (
                <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 p-3">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-success" />
                    <div>
                      <p className="text-xs font-medium text-foreground">{appliedCoupon.code}</p>
                      <p className="text-xs text-muted-foreground">
                        {appliedCoupon.discount_type === 'percentage' ? `${appliedCoupon.discount_value}% off` : `GH₵${appliedCoupon.discount_value} off`}
                      </p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRemoveCoupon}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Coupon code"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value)}
                    className="h-9"
                  />
                  <Button variant="outline" size="sm" onClick={handleApplyCoupon} disabled={applyingCoupon || !couponCode.trim()}>
                    Apply
                  </Button>
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal ({summary.itemCount} items)</span>
                  <span className="font-medium text-foreground">GH₵{summary.subtotal.toFixed(2)}</span>
                </div>
                {summary.discount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Discount</span>
                    <span>−GH₵{summary.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="font-medium text-foreground">Calculated at checkout</span>
                </div>
              </div>

              <div className="border-t border-border pt-3 flex justify-between">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-bold text-primary text-lg">GH₵{(summary.subtotal - summary.discount).toFixed(2)}</span>
              </div>

              <Button asChild className="w-full" size="lg">
                <Link href="/checkout">
                  Proceed to checkout <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>

              <Link href="/marketplace" className="block text-center text-xs text-muted-foreground hover:text-foreground">
                Continue shopping
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
