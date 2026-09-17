'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ShieldCheck, Clock, XCircle, AlertCircle, Upload, FileText,
  Check, Loader2, Info, Phone, Mail, GraduationCap, Building,
} from 'lucide-react';
import { toast } from 'sonner';
import { VERIFICATION_STATUS_LABELS } from '@/lib/types/vendor';

export default function VerificationPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <VerificationContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function VerificationContent() {
  const { user } = useAuth();
  const { vendor, loading } = useVendor();
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<{ url: string; label: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [verificationRequests, setVerificationRequests] = useState<{ id: string; status: string; request_type: string; admin_note: string | null; created_at: string; documents: { url: string; label: string }[] }[]>([]);

  useEffect(() => {
    if (!user) return;
    loadVerificationRequests();
  }, [user]);

  async function loadVerificationRequests() {
    if (!user) return;
    const { data } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setVerificationRequests(data || []);
  }

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </VendorDashboardLayout>
    );
  }

  const verificationStatus = user?.vendorProfile?.verification_status || 'pending';
  const statusInfo = VERIFICATION_STATUS_LABELS[verificationStatus] || VERIFICATION_STATUS_LABELS.pending;
  const isStudentVendor = user?.vendorProfile?.vendor_type === 'student_vendor';
  const isExternalVendor = user?.vendorProfile?.vendor_type === 'external_vendor';

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/verification-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('vendor-documents')
      .upload(path, file);

    if (error) {
      toast.error('Upload failed: ' + error.message);
    } else {
      // Keep the opaque private object path. Reviewer viewing is performed later
      // through the authorized, short-lived signing flow; never create a public URL.
      setUploadedDocs(prev => [...prev, { url: path, label: file.name }]);
      toast.success('Document uploaded');
    }
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!user || uploadedDocs.length === 0) {
      toast.error('Please upload at least one document');
      return;
    }

    setSubmitting(true);
    const requestType = isStudentVendor ? 'student_id' : 'vendor_business';

    const { error } = await supabase.rpc('submit_own_vendor_verification_request', {
      p_request_type: requestType,
      p_documents: uploadedDocs,
    });

    if (error) {
      toast.error('Could not submit: ' + error.message);
    } else {
      toast.success('Verification request submitted. We will review it within 1-2 business days.');
      setUploadedDocs([]);
      loadVerificationRequests();
    }
    setSubmitting(false);
  };

  const StatusIcon = verificationStatus === 'active' ? ShieldCheck : verificationStatus === 'rejected' ? XCircle : verificationStatus === 'suspended' ? AlertCircle : Clock;

  return (
    <VendorDashboardLayout
      vendorName={vendor?.business_name || ''}
      isVerified={vendor?.is_verified || false}
      subscriptionStatus={user?.vendorProfile?.subscription_status || 'none'}
    >
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Business Verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">Get verified to build trust with students.</p>
      </div>

      {/* Status banner */}
      <Card className={`mb-6 ${statusInfo.color === 'success' ? 'border-success/30 bg-success/5' : statusInfo.color === 'error' ? 'border-destructive/30 bg-destructive/5' : statusInfo.color === 'warning' ? 'border-warning/30 bg-warning/5' : ''}`}>
        <CardContent className="flex items-start gap-4 p-5">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${statusInfo.color === 'success' ? 'bg-success/10 text-success' : statusInfo.color === 'error' ? 'bg-destructive/10 text-destructive' : statusInfo.color === 'warning' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
            <StatusIcon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-foreground">{statusInfo.label}</p>
              <Badge className={`text-xs ${statusInfo.color === 'success' ? 'bg-success/10 text-success' : statusInfo.color === 'error' ? 'bg-destructive/10 text-destructive' : statusInfo.color === 'warning' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                {isStudentVendor ? 'Student Business' : 'External Business'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{statusInfo.description}</p>
            {user?.vendorProfile?.rejection_reason && verificationStatus === 'rejected' && (
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive">Reason: {user.vendorProfile.rejection_reason}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Verification methods */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Verification Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <VerificationMethod
              icon={isStudentVendor ? GraduationCap : Building}
              title={isStudentVendor ? 'Student Verification' : 'Business Document'}
              description={isStudentVendor ? 'Your student status will be checked against university records' : 'Upload your business registration document'}
              status={verificationStatus === 'active' ? 'verified' : 'pending'}
            />
            <VerificationMethod
              icon={Phone}
              title="Phone Verification"
              description="Your contact phone number will be verified"
              status={vendor?.contact_phone ? 'verified' : 'pending'}
            />
            <VerificationMethod
              icon={Mail}
              title="Email Verification"
              description="Your email address will be verified"
              status={user?.email ? 'verified' : 'pending'}
            />
            <VerificationMethod
              icon={ShieldCheck}
              title="Admin Approval"
              description="Our team manually reviews each application"
              status={verificationStatus === 'active' ? 'verified' : 'pending'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Upload documents (only if not verified) */}
      {verificationStatus !== 'active' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Submit Verification Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs text-foreground">
                  {isStudentVendor
                    ? 'Upload your student ID card or admission letter. Make sure the document is clear and readable.'
                    : 'Upload your business registration certificate, Ghana Card, or any official document that proves your business is legitimate.'}
                </p>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Upload Documents</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="h-4 w-4" /> Click to upload document (image or PDF)</>
                )}
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleDocUpload} />
              </label>
            </div>

            {uploadedDocs.length > 0 && (
              <div className="space-y-2">
                {uploadedDocs.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-3">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate text-sm text-foreground">{doc.label}</span>
                    <Check className="h-4 w-4 text-success" />
                  </div>
                ))}
              </div>
            )}

            <Button onClick={handleSubmit} disabled={submitting || uploadedDocs.length === 0} className="w-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit for Review
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Verification history */}
      {verificationRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Verification History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {verificationRequests.map((req) => (
              <div key={req.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground capitalize">{req.request_type.replace(/_/g, ' ')}</span>
                  </div>
                  <Badge className={`text-xs ${req.status === 'approved' ? 'bg-success/10 text-success' : req.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                    {req.status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Submitted {new Date(req.created_at).toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                {req.admin_note && (
                  <p className="mt-2 text-xs text-muted-foreground italic">Admin note: {req.admin_note}</p>
                )}
                {req.documents && req.documents.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">{req.documents.length} document(s) attached</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </VendorDashboardLayout>
  );
}

function VerificationMethod({ icon: Icon, title, description, status }: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  status: 'verified' | 'pending';
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${status === 'verified' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {status === 'verified' ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
