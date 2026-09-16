/*
# Update vendor categories to Ghana-specific names

Aligns business_type values with the Ghana university market terminology
specified in the platform requirements.

## Changes
- "Food & Restaurants" → "Food & Drinks"
- "Printing & Stationery" → "Printing & Photocopy"
- "Beauty" → "Hair & Beauty"
- "Electronics" → "Phone Accessories" (existing vendors are phone-focused)
- "Education" → "Tutoring"
- "Technology" → "Technology Services"
- "Student Services" → "Student Freelancers"

## Impact
- All vendor business_type values updated
- businesses.category values updated to match
- No data loss — only string values change
*/

UPDATE vendors SET business_type = 'Food & Drinks' WHERE business_type = 'Food & Restaurants';
UPDATE vendors SET business_type = 'Printing & Photocopy' WHERE business_type = 'Printing & Stationery';
UPDATE vendors SET business_type = 'Hair & Beauty' WHERE business_type = 'Beauty';
UPDATE vendors SET business_type = 'Phone Accessories' WHERE business_type = 'Electronics';
UPDATE vendors SET business_type = 'Tutoring' WHERE business_type = 'Education';
UPDATE vendors SET business_type = 'Technology Services' WHERE business_type = 'Technology';
UPDATE vendors SET business_type = 'Student Freelancers' WHERE business_type = 'Student Services';

UPDATE businesses SET category = 'Food & Drinks' WHERE category = 'Food & Restaurants';
UPDATE businesses SET category = 'Printing & Photocopy' WHERE category = 'Printing & Stationery';
UPDATE businesses SET category = 'Hair & Beauty' WHERE category = 'Beauty';
UPDATE businesses SET category = 'Phone Accessories' WHERE category = 'Electronics';
UPDATE businesses SET category = 'Tutoring' WHERE category = 'Education';
UPDATE businesses SET category = 'Technology Services' WHERE category = 'Technology';
UPDATE businesses SET category = 'Student Freelancers' WHERE category = 'Student Services';