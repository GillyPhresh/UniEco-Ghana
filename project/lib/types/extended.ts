import type { Vendor, University, Location, Business } from '@/lib/types';

export interface VendorWithRelations extends Vendor {
  university?: Pick<University, 'id' | 'name' | 'short_name' | 'slug'>;
  location?: Location | null;
  business?: Business | null;
}
