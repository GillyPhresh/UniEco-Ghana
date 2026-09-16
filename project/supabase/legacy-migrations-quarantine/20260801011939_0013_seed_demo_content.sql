/*
# Seed demo vendors, businesses, products, services, events, locations, reviews

Seeds realistic demo content for the UENR campus:
- Vendors (10) across multiple categories
- Businesses linked to vendors
- Products (15), Services (8)
- Events (5) — published campus events
- Locations (10) — GPS coordinates
- Reviews (20) — approved reviews from demo student profiles
*/

DO $$
DECLARE uenr_id uuid;
BEGIN
  SELECT id INTO uenr_id FROM universities WHERE slug = 'uenr';
  INSERT INTO vendors (university_id, owner_id, business_name, business_slug, business_type, description, is_student_business, is_verified, is_active, contact_phone, contact_email, rating_avg, rating_count, opening_hours)
  VALUES
    (uenr_id, '00000000-0000-0000-0000-000000000001', 'Campus Bites', 'campus-bites', 'Food & Restaurants', 'The best hot meals and snacks on campus. From waakye to jollof, we serve fresh food every day.', false, true, true, '0244123456', 'campusbites@uenr.edu.gh', 4.7, 23, '{"mon":{"open":"07:00","close":"21:00"},"tue":{"open":"07:00","close":"21:00"},"wed":{"open":"07:00","close":"21:00"},"thu":{"open":"07:00","close":"21:00"},"fri":{"open":"07:00","close":"22:00"},"sat":{"open":"08:00","close":"22:00"},"sun":{"open":"10:00","close":"18:00"}}'),
    (uenr_id, '00000000-0000-0000-0000-000000000002', 'UENR Print Hub', 'uenr-print-hub', 'Printing & Stationery', 'Fast and reliable printing, binding, and photocopy services for students and staff.', true, true, true, '0201234567', 'printrib@uenr.edu.gh', 4.5, 18, '{"mon":{"open":"08:00","close":"19:00"},"tue":{"open":"08:00","close":"19:00"},"wed":{"open":"08:00","close":"19:00"},"thu":{"open":"08:00","close":"19:00"},"fri":{"open":"08:00","close":"17:00"},"sat":{"open":"09:00","close":"15:00"}}'),
    (uenr_id, '00000000-0000-0000-0000-000000000003', 'TechPoint UENR', 'techpoint-uenr', 'Electronics', 'Phone repairs, accessories, and gadgets. We fix screens, batteries, and charging ports fast.', false, true, true, '0271234567', 'techpoint@uenr.edu.gh', 4.8, 31, '{"mon":{"open":"09:00","close":"18:00"},"tue":{"open":"09:00","close":"18:00"},"wed":{"open":"09:00","close":"18:00"},"thu":{"open":"09:00","close":"18:00"},"fri":{"open":"09:00","close":"18:00"},"sat":{"open":"10:00","close":"16:00"}}'),
    (uenr_id, '00000000-0000-0000-0000-000000000004', 'Serwaa Styles', 'serwaa-styles', 'Fashion', 'Trendy clothes, alterations, and custom outfits for the modern student. Look good on campus.', true, false, true, '0244556677', 'serwaastyles@gmail.com', 4.3, 12, '{"mon":{"open":"10:00","close":"19:00"},"tue":{"open":"10:00","close":"19:00"},"wed":{"open":"10:00","close":"19:00"},"thu":{"open":"10:00","close":"19:00"},"fri":{"open":"10:00","close":"20:00"},"sat":{"open":"10:00","close":"20:00"}}'),
    (uenr_id, '00000000-0000-0000-0000-000000000005', 'Sunyani Beauty Lounge', 'sunyani-beauty-lounge', 'Beauty', 'Hair styling, manicures, pedicures, and facials. Walk in looking fresh, walk out feeling amazing.', false, true, true, '0209988776', 'beautylounge@gmail.com', 4.6, 27, '{"mon":{"open":"09:00","close":"20:00"},"tue":{"open":"09:00","close":"20:00"},"wed":{"open":"09:00","close":"20:00"},"thu":{"open":"09:00","close":"20:00"},"fri":{"open":"09:00","close":"21:00"},"sat":{"open":"09:00","close":"21:00"},"sun":{"open":"12:00","close":"18:00"}}'),
    (uenr_id, '00000000-0000-0000-0000-000000000006', 'Campus Ride GH', 'campus-ride-gh', 'Transportation', 'Motorbike and shuttle services around campus and Sunyani. Get to class on time, every time.', false, true, true, '0244778899', 'campusride@gmail.com', 4.2, 15, '{}'),
    (uenr_id, '00000000-0000-0000-0000-000000000007', 'Kwame Photography', 'kwame-photography', 'Photography', 'Campus events, passport photos, and graduation shoots. Capture your best moments with us.', true, true, true, '0207654321', 'kwameshoots@gmail.com', 4.9, 34, '{"mon":{"open":"10:00","close":"18:00"},"tue":{"open":"10:00","close":"18:00"},"wed":{"open":"10:00","close":"18:00"},"thu":{"open":"10:00","close":"18:00"},"fri":{"open":"10:00","close":"18:00"},"sat":{"open":"08:00","close":"20:00"}}'),
    (uenr_id, '00000000-0000-0000-0000-000000000008', 'UENR Bookstore', 'uenr-bookstore', 'Education', 'Textbooks, past questions, and academic materials for all courses. Buy, sell, or trade your books.', false, true, true, '0244332211', 'bookstore@uenr.edu.gh', 4.4, 21, '{"mon":{"open":"08:00","close":"17:00"},"tue":{"open":"08:00","close":"17:00"},"wed":{"open":"08:00","close":"17:00"},"thu":{"open":"08:00","close":"17:00"},"fri":{"open":"08:00","close":"17:00"}}'),
    (uenr_id, '00000000-0000-0000-0000-000000000009', 'Green Bowl Smoothies', 'green-bowl-smoothies', 'Food & Restaurants', 'Fresh fruit smoothies, juices, and healthy snacks. Fuel your brain with natural energy.', true, false, true, '0208877665', 'greenbowl@gmail.com', 4.7, 19, '{"mon":{"open":"07:30","close":"19:00"},"tue":{"open":"07:30","close":"19:00"},"wed":{"open":"07:30","close":"19:00"},"thu":{"open":"07:30","close":"19:00"},"fri":{"open":"07:30","close":"19:00"},"sat":{"open":"09:00","close":"17:00"}}'),
    (uenr_id, '00000000-0000-0000-0000-000000000010', 'FixIt Repairs', 'fixit-repairs', 'Repairs', 'Laptop, phone, and appliance repairs. Quick diagnosis, fair prices, and genuine parts.', false, false, true, '0204455667', 'fixitrepairs@gmail.com', 4.1, 9, '{"mon":{"open":"09:00","close":"18:00"},"tue":{"open":"09:00","close":"18:00"},"wed":{"open":"09:00","close":"18:00"},"thu":{"open":"09:00","close":"18:00"},"fri":{"open":"09:00","close":"18:00"},"sat":{"open":"10:00","close":"15:00"}}')
  ON CONFLICT (business_slug) DO NOTHING;
END $$;

-- Businesses
INSERT INTO businesses (vendor_id, university_id, name, slug, description, category, is_active)
SELECT v.id, v.university_id, v.business_name, v.business_slug, v.description, v.business_type, true
FROM vendors v WHERE NOT EXISTS (SELECT 1 FROM businesses b WHERE b.vendor_id = v.id);

-- Products
INSERT INTO products (business_id, university_id, name, slug, description, price, currency, stock, is_active)
SELECT b.id, b.university_id, p.name, p.slug, p.description, p.price, 'GHS', p.stock, true
FROM businesses b JOIN (VALUES
  ('Campus Bites', 'Jollof Rice Special', 'jollof-rice-special', 'A plate of jollof rice with chicken and salad. A campus favourite.', 15.00, 100),
  ('Campus Bites', 'Waakye with Egg', 'waakye-with-egg', 'Traditional waakye with rice, beans, egg, and shito. Served hot.', 12.00, 80),
  ('Campus Bites', 'Fried Rice Combo', 'fried-rice-combo', 'Fried rice with chicken, sausage, and vegetables.', 18.00, 60),
  ('Campus Bites', 'Kelewele Snack Pack', 'kelewele-snack-pack', 'Spicy fried plantain cubes. Perfect for a quick bite.', 5.00, 150),
  ('UENR Print Hub', 'Black & White Printing (A4)', 'bw-printing-a4', 'High quality black and white printing on A4 paper. Per page pricing.', 1.00, 9999),
  ('UENR Print Hub', 'Color Printing (A4)', 'color-printing-a4', 'Full color printing on A4 glossy paper.', 3.00, 9999),
  ('UENR Print Hub', 'Spiral Binding', 'spiral-binding', 'Professional spiral binding for project reports and dissertations.', 8.00, 200),
  ('TechPoint UENR', 'Phone Screen Protector', 'phone-screen-protector', 'Tempered glass screen protector for all phone models.', 15.00, 50),
  ('TechPoint UENR', 'Phone Case', 'phone-case', 'Durable phone cases in various colors and designs.', 25.00, 40),
  ('TechPoint UENR', 'USB-C Cable', 'usb-c-cable', 'Fast charging USB-C cable, 1 meter length.', 12.00, 75),
  ('Serwaa Styles', 'Campus Tee Shirt', 'campus-tee-shirt', 'Custom printed tee shirts with university logos or your design.', 35.00, 30),
  ('Serwaa Styles', 'Tailored Trousers', 'tailored-trousers', 'Custom tailored trousers. Made to your measurements in 3 days.', 60.00, 15),
  ('UENR Bookstore', 'Engineering Mathematics Textbook', 'engineering-math-textbook', 'Core mathematics textbook for engineering students.', 45.00, 8),
  ('UENR Bookstore', 'Past Questions Pack', 'past-questions-pack', 'Compilation of past exam questions with solutions.', 20.00, 25),
  ('Green Bowl Smoothies', 'Mango Pineapple Smoothie', 'mango-pineapple-smoothie', 'Fresh blended mango and pineapple smoothie. No added sugar.', 10.00, 50)
) AS p(business_name, name, slug, description, price, stock) ON b.name = p.business_name
WHERE NOT EXISTS (SELECT 1 FROM products WHERE products.slug = p.slug);

-- Services
INSERT INTO services (business_id, university_id, name, slug, description, price, currency, duration_estimate, is_active)
SELECT b.id, b.university_id, s.name, s.slug, s.description, s.price, 'GHS', s.duration, true
FROM businesses b JOIN (VALUES
  ('UENR Print Hub', 'Lamination Service', 'lamination-service', 'Protect your documents with professional lamination.', 5.00, '10 mins'),
  ('TechPoint UENR', 'Phone Screen Repair', 'phone-screen-repair', 'Cracked screen? We replace screens for all phone models.', 80.00, '1 hour'),
  ('TechPoint UENR', 'Battery Replacement', 'battery-replacement', 'Is your phone dying too fast? Get a genuine battery replacement.', 60.00, '45 mins'),
  ('Serwaa Styles', 'Clothing Alterations', 'clothing-alterations', 'Hemming, resizing, and adjustments for all types of clothing.', 15.00, '24 hours'),
  ('Sunyani Beauty Lounge', 'Hair Braiding', 'hair-braiding', 'Professional braiding services. Box braids, cornrows, twists and more.', 50.00, '3 hours'),
  ('Sunyani Beauty Lounge', 'Manicure & Pedicure', 'manicure-pedicure', 'Full nail care treatment with polish. Relax and get pampered.', 35.00, '1 hour'),
  ('Kwame Photography', 'Graduation Photo Shoot', 'graduation-photo-shoot', 'Capture your special day with professional graduation photography.', 150.00, '2 hours'),
  ('FixIt Repairs', 'Laptop Diagnosis', 'laptop-diagnosis', 'Complete diagnostic check for your laptop. Find out what is wrong.', 20.00, '30 mins')
) AS s(business_name, name, slug, description, price, duration) ON b.name = s.business_name
WHERE NOT EXISTS (SELECT 1 FROM services WHERE services.slug = s.slug);

-- Events
INSERT INTO events (university_id, organizer_id, title, slug, description, start_time, end_time, location, is_virtual, is_published)
SELECT u.id, '00000000-0000-0000-0000-000000000001', e.title, e.slug, e.description, e.start_time, e.end_time, e.location, false, true
FROM universities u, (VALUES
  ('UENR Tech Fair 2026', 'uenr-tech-fair-2026', 'Annual technology fair showcasing student innovations, startups, and tech projects.', '2026-09-15 09:00:00+00'::timestamptz, '2026-09-15 17:00:00+00'::timestamptz, 'UENR Main Auditorium, Sunyani'),
  ('Campus Food Festival', 'campus-food-festival', 'A celebration of food on campus. Sample dishes from all campus vendors.', '2026-09-20 12:00:00+00'::timestamptz, '2026-09-20 20:00:00+00'::timestamptz, 'UENR Campus Square'),
  ('Career Fair & Networking', 'career-fair-networking', 'Meet employers, explore internships, and connect with industry professionals.', '2026-10-05 10:00:00+00'::timestamptz, '2026-10-05 16:00:00+00'::timestamptz, 'UENR Great Hall'),
  ('Inter-Hall Sports Gala', 'inter-hall-sports-gala', 'Annual sports competition between halls of residence.', '2026-10-12 08:00:00+00'::timestamptz, '2026-10-12 18:00:00+00'::timestamptz, 'UENR Sports Complex'),
  ('Freshers Welcome Party', 'freshers-welcome-party', 'Welcome to UENR first years! Music, games, food, and a chance to meet your mates.', '2026-09-08 18:00:00+00'::timestamptz, '2026-09-08 23:00:00+00'::timestamptz, 'UENR Campus Square')
) AS e(title, slug, description, start_time, end_time, location)
WHERE u.slug = 'uenr' ON CONFLICT (slug) DO NOTHING;

-- Locations
INSERT INTO locations (university_id, owner_type, owner_id, label, address_line, city, region, latitude, longitude)
SELECT v.university_id, 'vendor', v.id, v.business_name, l.address_line, 'Sunyani', 'Bono', l.lat, l.lng
FROM vendors v JOIN (VALUES
  ('Campus Bites', 'Near Hall 4, UENR Campus', 7.3421, -2.3265),
  ('UENR Print Hub', 'Library Building, Ground Floor', 7.3408, -2.3251),
  ('TechPoint UENR', 'Near Main Gate, UENR Campus', 7.3395, -2.3278),
  ('Serwaa Styles', 'Behind Hall 2, UENR Campus', 7.3412, -2.3260),
  ('Sunyani Beauty Lounge', 'Sunyani Central Market Area', 7.3358, -2.3282),
  ('Campus Ride GH', 'Main Gate, UENR Campus', 7.3392, -2.3280),
  ('Kwame Photography', 'Near Engineering Block', 7.3415, -2.3248),
  ('UENR Bookstore', 'Student Centre, UENR Campus', 7.3405, -2.3255),
  ('Green Bowl Smoothies', 'Near Hall 1, UENR Campus', 7.3425, -2.3270),
  ('FixIt Repairs', 'Sunyani Central, Near UENR Campus', 7.3365, -2.3290)
) AS l(business_name, address_line, lat, lng) ON v.business_name = l.business_name
WHERE NOT EXISTS (SELECT 1 FROM locations loc WHERE loc.owner_id = v.id);

-- Reviews
INSERT INTO reviews (reviewer_id, vendor_id, rating, comment, is_approved, created_at)
SELECT ('00000000-0000-0000-0000-' || lpad(r.reviewer_suffix, 12, '0'))::uuid, v.id, r.rating, r.comment, true, r.created_at::timestamptz
FROM vendors v JOIN (VALUES
  ('Campus Bites', '011', 5, 'Best jollof on campus hands down. The chicken is always well seasoned.', '2026-08-20 12:00:00+00'),
  ('Campus Bites', '012', 4, 'Good food but the queue can be long during lunch hour. Worth the wait though.', '2026-08-22 13:30:00+00'),
  ('Campus Bites', '013', 5, 'Their kelewele is addictive. I buy it every evening after class.', '2026-08-25 17:00:00+00'),
  ('UENR Print Hub', '014', 5, 'Fast printing and very affordable. The staff are always helpful.', '2026-08-18 10:00:00+00'),
  ('UENR Print Hub', '015', 4, 'Good quality printing but sometimes the machines are busy. Go early.', '2026-08-21 09:15:00+00'),
  ('TechPoint UENR', '016', 5, 'Fixed my cracked screen in under an hour. Looking brand new now.', '2026-08-19 14:00:00+00'),
  ('TechPoint UENR', '017', 5, 'Genuine phone accessories at fair prices. My go-to for anything phone related.', '2026-08-23 11:30:00+00'),
  ('TechPoint UENR', '018', 4, 'Good service but a bit pricey. Still, the quality is worth it.', '2026-08-26 15:45:00+00'),
  ('Serwaa Styles', '019', 4, 'Nice clothes and good fitting. The tailor knows what she is doing.', '2026-08-20 16:00:00+00'),
  ('Serwaa Styles', '020', 3, 'The clothes are nice but the wait time was longer than promised.', '2026-08-24 13:20:00+00'),
  ('Sunyani Beauty Lounge', '011', 5, 'Best manicure I have had in Sunyani. Very clean and professional.', '2026-08-19 13:00:00+00'),
  ('Sunyani Beauty Lounge', '012', 5, 'My braids came out perfect. I will definitely be coming back.', '2026-08-22 17:30:00+00'),
  ('Sunyani Beauty Lounge', '013', 4, 'Good service overall. The place can get busy on weekends.', '2026-08-27 12:00:00+00'),
  ('Campus Ride GH', '014', 4, 'Reliable motorbike service. They get me to class on time every morning.', '2026-08-21 07:30:00+00'),
  ('Campus Ride GH', '015', 3, 'Good rides but sometimes hard to get one during peak hours.', '2026-08-25 08:00:00+00'),
  ('Kwame Photography', '016', 5, 'My graduation photos came out amazing. Highly recommend Kwame.', '2026-08-18 15:00:00+00'),
  ('Kwame Photography', '017', 5, 'Professional and patient. He made everyone feel comfortable during the shoot.', '2026-08-23 16:30:00+00'),
  ('UENR Bookstore', '018', 4, 'Found my engineering textbook here at a good price.', '2026-08-20 11:00:00+00'),
  ('Green Bowl Smoothies', '019', 5, 'The mango smoothie is the best. Fresh and natural, no artificial stuff.', '2026-08-22 08:00:00+00'),
  ('FixIt Repairs', '020', 4, 'Fixed my laptop when nobody else could. Fair pricing and honest diagnosis.', '2026-08-26 14:15:00+00')
) AS r(business_name, reviewer_suffix, rating, comment, created_at) ON v.business_name = r.business_name
WHERE NOT EXISTS (SELECT 1 FROM reviews rv WHERE rv.vendor_id = v.id AND rv.comment = r.comment);