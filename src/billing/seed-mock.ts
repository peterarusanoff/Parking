import { faker } from '@faker-js/faker';
import { and, eq } from 'drizzle-orm';

import {
  db,
  garageAdmins,
  garages,
  passes,
  paymentMethods,
  payments,
  subscriptions,
  users,
  parked,
  garageDailyOccupancy,
} from '@/database/index';

/**
 * Mock seed script that creates test data without Stripe API calls
 * Perfect for local development and testing
 */
async function seedMock() {
  console.log('🌱 Starting mock seed process...\n');

  try {
    // Step 1: Create garages
    console.log('1️⃣ Creating garages...');
    const garageData = [
      {
        name: 'Downtown Parking Garage',
        address: '123 Main St, San Francisco, CA 94102',
        stripeAccountId: 'acct_mock_downtown',
        capacity: 600,
      },
      {
        name: 'Airport Long-term Parking',
        address: '456 Airport Blvd, San Francisco, CA 94128',
        stripeAccountId: 'acct_mock_airport',
        capacity: 1200,
      },
      {
        name: 'Financial District Garage',
        address: '789 Market St, San Francisco, CA 94103',
        stripeAccountId: 'acct_mock_financial',
        capacity: 450,
      },
    ];

    const createdGarages = [];
    for (const data of garageData) {
      const [existing] = await db
        .select()
        .from(garages)
        .where(eq(garages.name, data.name))
        .limit(1);

      if (existing) {
        console.log(`  ✓ Garage already exists: ${data.name}`);
        createdGarages.push(existing);
      } else {
        const [garage] = await db.insert(garages).values(data as any).returning();
        if (garage) {
          console.log(`  ✓ Created garage: ${data.name}`);
          createdGarages.push(garage);
        }
      }
    }

    // Step 2: Create passes for each garage
    console.log('\n2️⃣ Creating passes...');
    const passTemplates = [
      { name: 'Basic Monthly', description: 'Standard monthly parking', price: 150 },
      {
        name: 'Premium Monthly',
        description: 'Reserved spot with EV charging',
        price: 250,
      },
      { name: 'Weekend Only', description: 'Unlimited weekend parking', price: 89 },
    ];

    const createdPasses = [];
    for (const garage of createdGarages) {
      for (const template of passTemplates) {
        const passName = `${garage.name} - ${template.name}`;

        const [existing] = await db
          .select()
          .from(passes)
          .where(eq(passes.name, passName))
          .limit(1);

        if (existing) {
          console.log(`  ✓ Pass already exists: ${passName}`);
          createdPasses.push(existing);
        } else {
          const [pass] = await db
            .insert(passes)
            .values({
              garageId: garage.id,
              name: passName,
              description: template.description,
              stripeProductId: `prod_mock_${Math.random().toString(36).substring(7)}`,
              stripePriceId: `price_mock_${Math.random().toString(36).substring(7)}`,
              monthlyAmount: template.price.toString(),
              active: true,
            })
            .returning();

          if (pass) {
            console.log(`  ✓ Created pass: ${passName} ($${template.price}/mo)`);
            createdPasses.push(pass);
          }
        }
      }
    }

    // Step 3: Create admin users
    console.log('\n3️⃣ Creating admin users...');

    // Create super admin
    console.log('  Creating super admin...');
    const superAdminData = {
      firstName: 'Admin',
      lastName: 'Super',
      email: 'admin@vend.com',
      phone: '415-555-0001',
      stripeCustomerId: 'cus_mock_superadmin',
      role: 'super_admin' as const,
    };

    let superAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, superAdminData.email))
      .limit(1)
      .then((rows) => rows[0]);

    if (!superAdmin) {
      const [created] = await db.insert(users).values(superAdminData as any).returning();
      superAdmin = created!;
      console.log(`  ✓ Created super admin: ${superAdminData.email}`);
    } else {
      // Ensure role is super_admin
      if (superAdmin.role !== 'super_admin') {
        const [updated] = await db
          .update(users)
          .set({ role: 'super_admin' } as any)
          .where(eq(users.id, superAdmin.id))
          .returning();
        superAdmin = updated!;
      }
      console.log(`  ✓ Super admin already exists: ${superAdminData.email}`);
    }

    // Create garage admins (one for each garage)
    console.log('  Creating garage admins...');
    const garageAdminData = [
      {
        firstName: 'Sarah',
        lastName: 'Downtown',
        email: 'sarah.downtown@vend.com',
        phone: '415-555-0002',
        stripeCustomerId: 'cus_mock_sarah',
        role: 'garage_admin' as const,
        garageIndex: 0, // Downtown Parking
      },
      {
        firstName: 'Mike',
        lastName: 'Airport',
        email: 'mike.airport@vend.com',
        phone: '415-555-0003',
        stripeCustomerId: 'cus_mock_mike',
        role: 'garage_admin' as const,
        garageIndex: 1, // Airport Parking
      },
      {
        firstName: 'Lisa',
        lastName: 'Financial',
        email: 'lisa.financial@vend.com',
        phone: '415-555-0004',
        stripeCustomerId: 'cus_mock_lisa',
        role: 'garage_admin' as const,
        garageIndex: 2, // Financial District
      },
    ];

    const createdGarageAdmins = [];
    for (const adminData of garageAdminData) {
      let admin = await db
        .select()
        .from(users)
        .where(eq(users.email, adminData.email))
        .limit(1)
        .then((rows) => rows[0]);

      if (!admin) {
        const { garageIndex, ...userData } = adminData;
        const [created] = await db.insert(users).values(userData as any).returning();
        admin = created!;
        console.log(`  ✓ Created garage admin: ${adminData.email}`);
      } else {
        // Ensure role is garage_admin
        if (admin.role !== 'garage_admin') {
          const [updated] = await db
            .update(users)
            .set({ role: 'garage_admin' } as any)
            .where(eq(users.id, admin.id))
            .returning();
          admin = updated!;
        }
        console.log(`  ✓ Garage admin already exists: ${adminData.email}`);
      }

      if (admin) {
        createdGarageAdmins.push({ admin, garageIndex: adminData.garageIndex });
      }
    }

    // Step 4: Assign garage admins to their garages
    console.log('\n4️⃣ Assigning garage admins...');
    for (const { admin, garageIndex } of createdGarageAdmins) {
      const garage = createdGarages[garageIndex];
      if (!garage) continue;

      const [existing] = await db
        .select()
        .from(garageAdmins)
        .where(
          and(
            eq(garageAdmins.userId, admin.id),
            eq(garageAdmins.garageId, garage.id)
          )
        )
        .limit(1);

      if (existing) {
        console.log(
          `  ✓ Assignment already exists: ${admin.firstName} → ${garage.name}`
        );
      } else {
        await db.insert(garageAdmins).values({
          userId: admin.id,
          garageId: garage.id,
          assignedBy: superAdmin?.id,
          permissions:
            '{"view_reports": true, "manage_passes": true, "manage_subscriptions": true}',
        } as any);
        console.log(`  ✓ Assigned ${admin.firstName} ${admin.lastName} to ${garage.name}`);
      }
    }

    // Step 5: Create regular users with Faker
    console.log('\n5️⃣ Creating regular users with Faker...');
    
    // Seed Faker for consistent results
    faker.seed(12345);
    
    const numberOfUsers = 20;
    const createdUsers = [];
    const cardBrands = ['visa', 'mastercard', 'amex', 'discover'];
    
    for (let i = 0; i < numberOfUsers; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.email({ firstName, lastName }).toLowerCase();
      const phone = faker.phone.number({ style: 'national' });

      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing) {
        console.log(`  ✓ User already exists: ${email}`);
        createdUsers.push(existing);
        continue;
      }

      const [user] = await db
        .insert(users)
        .values({
          firstName,
          lastName,
          email,
          phone,
          stripeCustomerId: `cus_mock_${Math.random().toString(36).substring(7)}`,
        })
        .returning();
        
      if (user) {
        console.log(`  ✓ Created user: ${firstName} ${lastName} (${email})`);
        createdUsers.push(user);
        
        // Add a mock payment method for this user
        const cardBrand = cardBrands[i % cardBrands.length];
        const last4 = faker.finance.creditCardNumber({ issuer: '####' }).slice(-4);
        const expMonth = faker.number.int({ min: 1, max: 12 });
        const expYear = faker.number.int({ min: 2025, max: 2030 });
        
        const [pm] = await db
          .insert(paymentMethods)
          .values({
            userId: user.id,
            stripePaymentMethodId: `pm_mock_${Math.random().toString(36).substring(7)}`,
            type: 'card',
            isDefault: true,
            cardBrand,
            cardLast4: last4,
            cardExpMonth: expMonth,
            cardExpYear: expYear,
            metadata: {},
          })
          .returning();
          
        if (pm) {
          console.log(`    ✓ Added payment method: ${cardBrand} ****${last4}`);
        }
      }
    }

    // Step 6: Create mock subscriptions
    console.log('\n6️⃣ Creating subscriptions...');
    let subscriptionCount = 0;

    for (let i = 0; i < createdUsers.length; i++) {
      const user = createdUsers[i];
      const pass = createdPasses[i % createdPasses.length];

      if (!user || !pass) continue;

      // Check if subscription already exists
      const [existingSub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, user.id))
        .limit(1);

      if (existingSub) {
        console.log(`  ✓ Subscription already exists for ${user.email}`);
        subscriptionCount++;
        continue;
      }

      const now = new Date();
      const periodStart = new Date(now);
      periodStart.setDate(1); // First of the month
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const [subscription] = await db
        .insert(subscriptions)
        .values({
          stripeSubscriptionId: `sub_mock_${Math.random().toString(36).substring(7)}`,
          userId: user.id,
          garageId: pass.garageId,
          passId: pass.id,
          stripePriceId: pass.stripePriceId,
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          monthlyAmount: pass.monthlyAmount as any,
        })
        .returning();

      if (subscription) {
        console.log(
          `  ✓ Subscribed ${user.firstName} ${user.lastName} to ${pass.name}`
        );
        subscriptionCount++;
      }
    }

    // Step 7 & 8: Create 3 weeks of parked logs and daily occupancy
    console.log('\n7️⃣ Creating 3-week parking and occupancy...');
    const allUsers = await db.select().from(users);
    const pickUserId = () => {
      if (!allUsers.length) return undefined;
      const idx = Math.floor(Math.random() * allUsers.length);
      return allUsers[idx]!.id;
    };

    const days = 21;
    let createdParked = 0;
    let occupancyCreated = 0;

    const generateHourly = (cap: number, date: Date) => {
      const dayOfWeek = date.getDay();
      return Array.from({ length: 24 }, (_, h) => {
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const peakBase = isWeekend ? 0.35 : 0.7;
        const offBase = isWeekend ? 0.1 : 0.2;
        let base = offBase;
        if (h >= 7 && h < 10) base = offBase + (peakBase - offBase) * ((h - 7 + 1) / 4);
        else if (h >= 10 && h < 16) base = peakBase;
        else if (h >= 16 && h < 19) base = offBase + (peakBase - offBase) * ((19 - h) / 3);
        const variance = (Math.random() - 0.5) * 0.1;
        return Math.max(0, Math.min(cap, Math.floor(cap * (base + variance))));
      });
    };

    for (const garage of createdGarages) {
      const capacity = (garage as any).capacity ?? 200;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (days - 1));

      // Guard: if occupancy for start day exists, skip this garage
      const [existingFirstDay] = await db
        .select()
        .from(garageDailyOccupancy)
        .where(and(eq(garageDailyOccupancy.garageId as any, garage.id), eq(garageDailyOccupancy.day as any, start)))
        .limit(1);
      if (existingFirstDay) {
        console.log(`  ↷ Skipping ${garage.name} (already seeded window)`);
        continue;
      }

      for (let d = 0; d < days; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + d);

        const hourly = generateHourly(capacity, day);
        await db
          .insert(garageDailyOccupancy)
          .values({ garageId: garage.id, day, hourlyOccupancy: hourly } as any);
        occupancyCreated++;

        const numLogs = 40 + Math.floor(Math.random() * 100);
        for (let i = 0; i < numLogs; i++) {
          const hourWeights = hourly.map((v) => v + 1);
          const total = hourWeights.reduce((a, b) => a + b, 0);
          let r = Math.random() * total;
          let chosenHour = 0;
          for (let h = 0; h < 24; h++) {
            const w = hourWeights[h] ?? 0;
            if (r < w) { chosenHour = h; break; }
            r -= w;
          }
          const enteredAt = new Date(day);
          enteredAt.setHours(chosenHour, Math.floor(Math.random() * 60), 0, 0);

          const willExit = Math.random() < 0.75;
          let exitedAt: Date | null = null;
          if (willExit) {
            const durationHours = 1 + Math.floor(Math.random() * 6);
            exitedAt = new Date(enteredAt.getTime() + durationHours * 60 * 60 * 1000);
          }

          const userId = pickUserId();
          const [row] = await db
            .insert(parked)
            .values({
              garageId: garage.id,
              userId,
              vehiclePlate: `MOCK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
              enteredAt,
              ...(exitedAt && { exitedAt }),
            } as any)
            .returning();
          if (row) createdParked++;
        }
      }
    }

    // Step 9: Create mock payments (3 months of history)
    console.log('\n9️⃣ Creating payment history...');
    const allSubscriptions = await db.select().from(subscriptions);
    let paymentCount = 0;

    for (const subscription of allSubscriptions) {
      // Create 3-6 months of payment history
      const monthsBack = 3 + Math.floor(Math.random() * 3);

      for (let month = 0; month < monthsBack; month++) {
        const paymentDate = new Date();
        paymentDate.setMonth(paymentDate.getMonth() - month);
        paymentDate.setDate(1); // First of the month

        // Check if payment already exists for this month
        const startOfMonth = new Date(paymentDate);
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const [existingPayment] = await db
          .select()
          .from(payments)
          .where(eq(payments.subscriptionId, subscription.id))
          .limit(1);

        if (existingPayment && month === 0) {
          console.log(`  ✓ Payment already exists for subscription`);
          continue;
        }

        const amount = parseFloat(subscription.monthlyAmount);
        const stripeFee = amount * 0.029 + 0.3; // Stripe fee: 2.9% + $0.30
        const netAmount = amount - stripeFee;

        await db.insert(payments).values({
          stripePaymentIntentId: `pi_mock_${Math.random().toString(36).substring(7)}`,
          subscriptionId: subscription.id,
          garageId: subscription.garageId,
          amount: amount.toFixed(2),
          stripeFee: stripeFee.toFixed(2),
          netAmount: netAmount.toFixed(2),
          status: 'succeeded',
          currency: 'usd',
          paymentDate: paymentDate,
        });

        paymentCount++;
      }
    }

    console.log(`  ✓ Created ${paymentCount} payment records`);

    console.log(`\n✅ Mock seed complete!`);
    console.log(`  - Garages: ${createdGarages.length}`);
    console.log(`  - Passes: ${createdPasses.length}`);
    console.log(`  - Super Admin: 1 (admin@vend.com)`);
    console.log(`  - Garage Admins: ${createdGarageAdmins.length}`);
    console.log(`  - Regular Users: ${createdUsers.length}`);
    console.log(`  - Payment Methods: ${createdUsers.length} (mock cards)`);
    console.log(`  - Subscriptions: ${subscriptionCount}`);
    console.log(`  - Parked Logs: ${createdParked}`);
    console.log(`  - Daily Occupancy Records: ${occupancyCreated}`);
    console.log(`  - Payments: ${paymentCount}`);
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run seed
seedMock();

