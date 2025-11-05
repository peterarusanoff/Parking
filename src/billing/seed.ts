import { and, eq } from 'drizzle-orm';

import {
  db,
  garageAdmins,
  garageDailyOccupancy,
  garages,
  parked,
  passes,
  users,
} from '@/database/index';

import {
  createGaragePass,
  subscribeUserToPass,
  type CreateGaragePassParams,
} from './billing';
import { createUser } from './user-management';

/**
 * Seed script to populate the database with test data
 * Idempotent - checks if data exists before creating
 */
async function seed() {
  console.log('🌱 Starting seed process...\n');

  try {
    // Step 1: Create garages
    console.log('1️⃣ Creating garages...');
    const garageData = [
      {
        name: 'Downtown Parking Garage',
        address: '123 Main St, San Francisco, CA 94102',
        capacity: 600,
      },
      {
        name: 'Airport Long-term Parking',
        address: '456 Airport Blvd, San Francisco, CA 94128',
        capacity: 1200,
      },
      {
        name: 'Financial District Garage',
        address: '789 Market St, San Francisco, CA 94103',
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
        const [garage] = await db
          .insert(garages)
          .values(data as any)
          .returning();
        if (garage) {
          console.log(`  ✓ Created garage: ${data.name}`);
          createdGarages.push(garage);
        }
      }
    }

    // Step 2: Create passes for each garage
    console.log('\n2️⃣ Creating passes...');
    const passTemplates = [
      {
        name: 'Basic Monthly',
        description: 'Standard monthly parking',
        price: 150,
      },
      {
        name: 'Premium Monthly',
        description: 'Reserved spot with EV charging',
        price: 250,
      },
      {
        name: 'Weekend Only',
        description: 'Unlimited weekend parking',
        price: 89,
      },
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
          // Create Stripe product and price
          const passParams: CreateGaragePassParams = {
            passId: crypto.randomUUID(),
            garageId: garage.id,
            name: passName,
            description: template.description,
            monthlyPrice: template.price,
          };

          const stripeResult = await createGaragePass(passParams);

          if (stripeResult.success) {
            const [pass] = await db
              .insert(passes)
              .values({
                id: passParams.passId,
                garageId: garage.id,
                name: passName,
                description: template.description,
                stripeProductId: stripeResult.data.productId,
                stripePriceId: stripeResult.data.priceId,
                monthlyAmount: template.price.toString(),
                active: true,
              })
              .returning();

            if (pass) {
              console.log(
                `  ✓ Created pass: ${passName} ($${template.price}/mo)`
              );
              createdPasses.push(pass);
            }
          } else {
            console.error(
              `  ✗ Failed to create pass: ${passName}`,
              stripeResult.error.message
            );
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
    };

    let superAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, superAdminData.email))
      .limit(1)
      .then((rows) => rows[0]);

    if (!superAdmin) {
      const result = await createUser(superAdminData);
      if (result.success) {
        superAdmin = result.data;
        // Update role to super_admin
        const [updated] = await db
          .update(users)
          .set({ role: 'super_admin' } as any)
          .where(eq(users.id, superAdmin.id))
          .returning();
        superAdmin = updated!;
        console.log(`  ✓ Created super admin: ${superAdminData.email}`);
      }
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
        garageIndex: 0, // Downtown Parking
      },
      {
        firstName: 'Mike',
        lastName: 'Airport',
        email: 'mike.airport@vend.com',
        phone: '415-555-0003',
        garageIndex: 1, // Airport Parking
      },
      {
        firstName: 'Lisa',
        lastName: 'Financial',
        email: 'lisa.financial@vend.com',
        phone: '415-555-0004',
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
        const result = await createUser({
          firstName: adminData.firstName,
          lastName: adminData.lastName,
          email: adminData.email,
          phone: adminData.phone,
        });

        if (result.success) {
          admin = result.data;
          // Update role to garage_admin
          const [updated] = await db
            .update(users)
            .set({ role: 'garage_admin' } as any)
            .where(eq(users.id, admin.id))
            .returning();
          admin = updated!;
          console.log(`  ✓ Created garage admin: ${adminData.email}`);
        }
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
        console.log(
          `  ✓ Assigned ${admin.firstName} ${admin.lastName} to ${garage.name}`
        );
      }
    }

    // Step 5: Create regular users
    console.log('\n5️⃣ Creating regular users...');
    const userData = [
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '415-555-0101',
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        phone: '415-555-0102',
      },
      {
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob.johnson@example.com',
        phone: '415-555-0103',
      },
      {
        firstName: 'Alice',
        lastName: 'Williams',
        email: 'alice.williams@example.com',
        phone: '415-555-0104',
      },
      {
        firstName: 'Charlie',
        lastName: 'Brown',
        email: 'charlie.brown@example.com',
        phone: '415-555-0105',
      },
      {
        firstName: 'Diana',
        lastName: 'Davis',
        email: 'diana.davis@example.com',
        phone: '415-555-0106',
      },
      {
        firstName: 'Edward',
        lastName: 'Miller',
        email: 'edward.miller@example.com',
        phone: '415-555-0107',
      },
      {
        firstName: 'Fiona',
        lastName: 'Wilson',
        email: 'fiona.wilson@example.com',
        phone: '415-555-0108',
      },
      {
        firstName: 'George',
        lastName: 'Moore',
        email: 'george.moore@example.com',
        phone: '415-555-0109',
      },
      {
        firstName: 'Hannah',
        lastName: 'Taylor',
        email: 'hannah.taylor@example.com',
        phone: '415-555-0110',
      },
      {
        firstName: 'Ian',
        lastName: 'Anderson',
        email: 'ian.anderson@example.com',
        phone: '415-555-0111',
      },
      {
        firstName: 'Julia',
        lastName: 'Thomas',
        email: 'julia.thomas@example.com',
        phone: '415-555-0112',
      },
      {
        firstName: 'Kevin',
        lastName: 'Jackson',
        email: 'kevin.jackson@example.com',
        phone: '415-555-0113',
      },
      {
        firstName: 'Laura',
        lastName: 'White',
        email: 'laura.white@example.com',
        phone: '415-555-0114',
      },
      {
        firstName: 'Michael',
        lastName: 'Harris',
        email: 'michael.harris@example.com',
        phone: '415-555-0115',
      },
      {
        firstName: 'Nina',
        lastName: 'Martin',
        email: 'nina.martin@example.com',
        phone: '415-555-0116',
      },
      {
        firstName: 'Oscar',
        lastName: 'Thompson',
        email: 'oscar.thompson@example.com',
        phone: '415-555-0117',
      },
      {
        firstName: 'Paula',
        lastName: 'Garcia',
        email: 'paula.garcia@example.com',
        phone: '415-555-0118',
      },
      {
        firstName: 'Quinn',
        lastName: 'Martinez',
        email: 'quinn.martinez@example.com',
        phone: '415-555-0119',
      },
      {
        firstName: 'Rachel',
        lastName: 'Robinson',
        email: 'rachel.robinson@example.com',
        phone: '415-555-0120',
      },
    ];

    const createdUsers = [];
    for (const data of userData) {
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (existing) {
        console.log(`  ✓ User already exists: ${data.email}`);
        createdUsers.push(existing);
      } else {
        // Use createUser to automatically create Stripe customer
        const result = await createUser({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
        });

        if (result.success) {
          console.log(
            `  ✓ Created user with Stripe customer: ${data.firstName} ${data.lastName} (${result.data.stripeCustomerId})`
          );
          createdUsers.push(result.data);
        } else {
          console.error(
            `  ✗ Failed to create user ${data.email}:`,
            result.error.message
          );
        }
      }
    }

    // Step 6: Subscribe users to passes (distribute across garages)
    console.log('\n6️⃣ Subscribing users to passes...');
    let subscriptionCount = 0;

    for (let i = 0; i < createdUsers.length; i++) {
      const user = createdUsers[i];
      // Distribute users across passes
      const pass = createdPasses[i % createdPasses.length];

      if (!user || !pass) continue;

      const result = await subscribeUserToPass({
        userId: user.id,
        passId: pass.id,
      });

      if (result.success) {
        console.log(
          `  ✓ Subscribed ${user.firstName} ${user.lastName} to ${pass.name}`
        );
        subscriptionCount++;
      } else {
        console.error(
          `  ✗ Failed to subscribe ${user.email}:`,
          result.error.message
        );
      }
    }

    // Step 7: Seed 3 weeks of parking and occupancy data
    console.log('\n7️⃣ Seeding 3-week parking and occupancy data...');
    const allUsers = await db.select().from(users);
    const pickUserId = () => {
      if (!allUsers.length) return undefined;
      const idx = Math.floor(Math.random() * allUsers.length);
      return allUsers[idx]!.id;
    };

    const days = 21;
    let parkedCount = 0;
    let occupancyRecords = 0;

    const generateHourly = (cap: number, date: Date) => {
      const dayOfWeek = date.getDay(); // 0=Sun ... 6=Sat
      return Array.from({ length: 24 }, (_, h) => {
        // weekday vs weekend baseline
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const peakBase = isWeekend ? 0.35 : 0.7; // lower on weekends
        const offBase = isWeekend ? 0.1 : 0.2;

        // morning ramp 7-10, peak 10-16, evening 16-19, low otherwise
        let base = offBase;
        if (h >= 7 && h < 10) base = offBase + (peakBase - offBase) * ((h - 7 + 1) / 4);
        else if (h >= 10 && h < 16) base = peakBase;
        else if (h >= 16 && h < 19) base = offBase + (peakBase - offBase) * ((19 - h) / 3);

        const variance = (Math.random() - 0.5) * 0.1; // +/-5%
        const value = Math.max(0, Math.min(cap, Math.floor(cap * (base + variance))));
        return value;
      });
    };

    for (const garage of createdGarages) {
      const capacity = (garage as any).capacity ?? 200;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (days - 1));

      // Skip if occupancy already exists for the start day (idempotency)
      const [existingFirstDay] = await db
        .select()
        .from(garageDailyOccupancy)
        .where(
          and(eq(garageDailyOccupancy.garageId as any, garage.id), eq(garageDailyOccupancy.day as any, start))
        )
        .limit(1);

      if (existingFirstDay) {
        console.log(`  ↷ Skipping occupancy/logs for ${garage.name} (already seeded)`);
        continue;
      }

      for (let d = 0; d < days; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + d);

        // Occupancy for this day
        const hourly = generateHourly(capacity, day);
        await db
          .insert(garageDailyOccupancy)
          .values({ garageId: garage.id, day, hourlyOccupancy: hourly } as any);
        occupancyRecords++;

        // Parked logs for this day (sampled around occupancy; 40-140 entries/day)
        const numLogs = 40 + Math.floor(Math.random() * 100);
        for (let i = 0; i < numLogs; i++) {
          const hourWeights = hourly.map((v) => v + 1);
          const total = hourWeights.reduce((a, b) => a + b, 0);
          let r = Math.random() * total;
          let chosenHour = 0;
          for (let h = 0; h < 24; h++) {
            const w = hourWeights[h] ?? 0;
            if (r < w) {
              chosenHour = h;
              break;
            }
            r -= w;
          }
          const enteredAt = new Date(day);
          enteredAt.setHours(chosenHour, Math.floor(Math.random() * 60), 0, 0);

          const exitProb = 0.75;
          const willExit = Math.random() < exitProb;
          let exitedAt: Date | null = null;
          if (willExit) {
            const durationHours = 1 + Math.floor(Math.random() * 6);
            exitedAt = new Date(enteredAt.getTime() + durationHours * 60 * 60 * 1000);
          }

          const userId = pickUserId();
          await db.insert(parked).values({
            garageId: garage.id,
            userId,
            vehiclePlate: `TEST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            enteredAt,
            ...(exitedAt && { exitedAt }),
          } as any);
          parkedCount++;
        }
      }
    }

    console.log(`\n✅ Seed complete!`);
    console.log(`  - Garages: ${createdGarages.length}`);
    console.log(`  - Passes: ${createdPasses.length}`);
    console.log(`  - Super Admin: 1 (admin@vend.com)`);
    console.log(`  - Garage Admins: ${createdGarageAdmins.length}`);
    console.log(`  - Regular Users: ${createdUsers.length}`);
    console.log(`  - Subscriptions: ${subscriptionCount}`);
    console.log(`  - Parked Logs: ${parkedCount}`);
    console.log(`  - Daily Occupancy Records: ${occupancyRecords}`);
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run seed
seed();
