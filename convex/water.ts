import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const defaultSettings: {
  goal: number;
  startTime: string;
  endTime: string;
  interval: number;
  reminderActive: boolean;
  nextReminderAt?: number;
} = {
  goal: 2500,
  startTime: "08:00",
  endTime: "22:00",
  interval: 60,
  reminderActive: false,
};

async function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("You must be signed in.");
  return identity.subject;
}

export const getToday = query({
  args: {
    dateKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const settings =
      (await ctx.db
        .query("userSettings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique()) ?? defaultSettings;

    const entries = await ctx.db
      .query("waterEntries")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("dateKey", args.dateKey))
      .collect();

    const achievements = await ctx.db
      .query("achievements")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .collect();

    return {
      settings: {
        goal: settings.goal,
        startTime: settings.startTime,
        endTime: settings.endTime,
        interval: settings.interval,
        reminderActive: settings.reminderActive,
        nextReminderAt: settings.nextReminderAt,
      },
      entries: entries.sort((a, b) => a.createdAt - b.createdAt),
      achievedDates: achievements.map((achievement) => achievement.dateKey),
    };
  },
});

export const addEntry = mutation({
  args: {
    amount: v.number(),
    dateKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await ctx.db.insert("waterEntries", {
      userId,
      dateKey: args.dateKey,
      amount: args.amount,
      createdAt: Date.now(),
    });
  },
});

export const undoLastEntry = mutation({
  args: {
    dateKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const entries = await ctx.db
      .query("waterEntries")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("dateKey", args.dateKey))
      .collect();
    const lastEntry = entries.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (lastEntry) await ctx.db.delete(lastEntry._id);
  },
});

export const resetToday = mutation({
  args: {
    dateKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const entries = await ctx.db
      .query("waterEntries")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("dateKey", args.dateKey))
      .collect();
    await Promise.all(entries.map((entry) => ctx.db.delete(entry._id)));

    const achievement = await ctx.db
      .query("achievements")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("dateKey", args.dateKey))
      .unique();
    if (achievement) await ctx.db.delete(achievement._id);
  },
});

export const saveSettings = mutation({
  args: {
    goal: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    interval: v.number(),
    reminderActive: v.boolean(),
    nextReminderAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const value = {
      userId,
      goal: args.goal,
      startTime: args.startTime,
      endTime: args.endTime,
      interval: args.interval,
      reminderActive: args.reminderActive,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, { ...value, nextReminderAt: args.nextReminderAt });
    } else {
      await ctx.db.insert("userSettings", {
        ...value,
        ...(args.nextReminderAt === undefined ? {} : { nextReminderAt: args.nextReminderAt }),
      });
    }
  },
});

export const markAchieved = mutation({
  args: {
    dateKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("achievements")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("dateKey", args.dateKey))
      .unique();
    if (!existing) {
      await ctx.db.insert("achievements", {
        userId,
        dateKey: args.dateKey,
        createdAt: Date.now(),
      });
    }
  },
});
