'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import {
  getVendorProducts, createProduct, updateProduct, archiveProduct,
  restoreProduct, deleteProduct, getStockStatus, uploadVendorImage,
} from '@/lib/data/vendor-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_CATEGORIES } from '@/lib/constants/categories';
import type { Product } from '@/lib/types';
import {
  Package, Plus, Edit2, Archive, Trash2, RotateCcw, Save, Loader2,
  Search, AlertTriangle, X, Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProductsPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <ProductsContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function ProductsContent() {
  const { vendor, loading } = useVendor();
  const [products, setProducts] = useState<(Product & { business: { id: string; name: string; slug: string } })[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    if (!vendor) return;
    loadProducts();
  }, [vendor, showArchived]);

  async function loadProducts() {
    if (!vendor) return;
    setDataLoading(true);
    const data = await getVendorProducts(vendor.id, showArchived);
    setProducts(data);
    setDataLoading(false);
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </VendorDashboardLayout>
    );
  }

  return (
    <VendorDashboardLayout
      vendorName={vendor?.business_name || ''}
      isVerified={vendor?.is_verified || false}
      subscriptionStatus=""
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your product catalog.</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Product
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show archived</span>
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
        </div>
      </div>

      {/* Products grid */}
      {dataLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-foreground">
              {showArchived ? 'No archived products' : 'No products yet'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {showArchived ? 'Archived products will appear here.' : 'Add your first product to start selling.'}
            </p>
            {!showArchived && (
              <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => setEditingProduct(product)}
              onArchive={async () => {
                const { error } = await archiveProduct(product.id);
                if (error) { toast.error(error); } else { toast.success('Product archived'); loadProducts(); }
              }}
              onRestore={async () => {
                const { error } = await restoreProduct(product.id);
                if (error) { toast.error(error); } else { toast.success('Product restored'); loadProducts(); }
              }}
              onDelete={async () => {
                if (!confirm('Permanently delete this product? This cannot be undone.')) return;
                const { error } = await deleteProduct(product.id);
                if (error) { toast.error(error); } else { toast.success('Product deleted'); loadProducts(); }
              }}
            />
          ))}
        </div>
      )}

      {/* Add product dialog */}
      <ProductFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        vendorId={vendor?.id || ''}
        businessId={products[0]?.business?.id || ''}
        onSaved={() => { loadProducts(); setShowAddDialog(false); }}
      />

      {/* Edit product dialog */}
      {editingProduct && (
        <ProductFormDialog
          open={!!editingProduct}
          onOpenChange={(open) => { if (!open) setEditingProduct(null); }}
          vendorId={vendor?.id || ''}
          businessId={editingProduct.business_id}
          product={editingProduct}
          onSaved={() => { loadProducts(); setEditingProduct(null); }}
        />
      )}
    </VendorDashboardLayout>
  );
}

function ProductCard({ product, onEdit, onArchive, onRestore, onDelete }: {
  product: Product;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const stockStatus = getStockStatus(product);
  const image = product.image_url || (product.images && product.images[0]) || null;
  const displayPrice = product.discount_price
    ? `GH₵${product.discount_price}`
    : `GH₵${product.price}`;

  return (
    <Card className="group overflow-hidden">
      <div className="relative h-36 overflow-hidden bg-muted">
        {image ? (
          <img src={image} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/40">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        {product.discount_price && (
          <Badge className="absolute left-2 top-2 bg-destructive text-destructive-foreground text-xs">Sale</Badge>
        )}
        {product.is_archived && (
          <Badge className="absolute left-2 top-2 bg-muted text-muted-foreground text-xs">Archived</Badge>
        )}
      </div>
      <CardContent className="p-4">
        <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
        <p className="mt-1 text-sm font-medium text-primary">{displayPrice}</p>
        {product.discount_price && (
          <p className="text-xs text-muted-foreground line-through">GH₵{product.price}</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Badge className={`text-xs ${
            stockStatus.color === 'success' ? 'bg-success/10 text-success' :
            stockStatus.color === 'warning' ? 'bg-warning/10 text-warning' :
            stockStatus.color === 'error' ? 'bg-destructive/10 text-destructive' :
            'bg-muted text-muted-foreground'
          }`}>
            {stockStatus.label}
          </Badge>
          {product.sku && <span className="text-xs text-muted-foreground">SKU: {product.sku}</span>}
        </div>
        <div className="mt-3 flex items-center gap-1">
          {!product.is_archived ? (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}>
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onArchive}>
                <Archive className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRestore}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductFormDialog({ open, onOpenChange, vendorId, businessId, product, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  businessId: string;
  product?: Product | null;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    discount_price: '',
    stock: '0',
    sku: '',
    tags: '',
    image_url: '',
    is_active: true,
    low_stock_threshold: '5',
  });

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        description: product.description || '',
        price: String(product.price),
        discount_price: product.discount_price ? String(product.discount_price) : '',
        stock: String(product.stock),
        sku: product.sku || '',
        tags: (product.tags || []).join(', '),
        image_url: product.image_url || (product.images && product.images[0]) || '',
        is_active: product.is_active,
        low_stock_threshold: String(product.low_stock_threshold),
      });
    } else {
      setForm({
        name: '', description: '', price: '', discount_price: '',
        stock: '0', sku: '', tags: '', image_url: '',
        is_active: true, low_stock_threshold: '5',
      });
    }
  }, [product]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendorId) return;
    setUploading(true);
    const { url, error } = await uploadVendorImage(vendorId, file, 'vendor-assets', 'products');
    if (error) { toast.error('Upload failed: ' + error); }
    else if (url) { setForm(prev => ({ ...prev, image_url: url })); toast.success('Image uploaded'); }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) { toast.error('Name and price are required'); return; }

    setSaving(true);
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    const images = form.image_url ? [form.image_url] : [];

    if (product) {
      const { error } = await updateProduct(product.id, {
        name: form.name,
        description: form.description || null,
        price: Number(form.price),
        discount_price: form.discount_price ? Number(form.discount_price) : null,
        stock: Number(form.stock),
        sku: form.sku || null,
        tags,
        images,
        image_url: form.image_url || null,
        is_active: form.is_active,
        low_stock_threshold: Number(form.low_stock_threshold),
      });
      if (error) { toast.error(error); } else { toast.success('Product updated'); onSaved(); }
    } else {
      if (!businessId) { toast.error('No business found. Please complete your business profile first.'); setSaving(false); return; }
      const { error } = await createProduct({
        business_id: businessId,
        name: form.name,
        description: form.description || undefined,
        price: Number(form.price),
        discount_price: form.discount_price ? Number(form.discount_price) : null,
        stock: Number(form.stock),
        sku: form.sku || undefined,
        tags,
        images,
        image_url: form.image_url || null,
        is_active: form.is_active,
        low_stock_threshold: Number(form.low_stock_threshold),
      });
      if (error) { toast.error(error); } else { toast.success('Product added'); onSaved(); }
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'Add Product'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Image */}
          <div>
            <Label className="mb-2 block">Product Image</Label>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted">
                {form.image_url ? (
                  <img src={form.image_url} alt="Product" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground/40">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
              </div>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {uploading ? 'Uploading...' : 'Upload image'}
                </span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p_name">Product Name</Label>
            <Input id="p_name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Campus Special Waakye" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="p_desc">Description</Label>
            <Textarea id="p_desc" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe your product..." />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p_price">Price (GH₵)</Label>
              <Input id="p_price" type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p_discount">Discount Price (optional)</Label>
              <Input id="p_discount" type="number" value={form.discount_price} onChange={e => setForm(p => ({ ...p, discount_price: e.target.value }))} placeholder="0.00" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p_stock">Stock Quantity</Label>
              <Input id="p_stock" type="number" value={form.stock} onChange={e => setForm(p => ({ ...p, stock: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p_sku">SKU (optional)</Label>
              <Input id="p_sku" value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} placeholder="e.g. WAE-001" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p_tags">Tags (comma-separated)</Label>
              <Input id="p_tags" value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="food, breakfast, local" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p_low">Low Stock Threshold</Label>
              <Input id="p_low" type="number" value={form.low_stock_threshold} onChange={e => setForm(p => ({ ...p, low_stock_threshold: e.target.value }))} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="p_active">Available for purchase</Label>
            <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
