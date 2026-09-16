import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  userSettings: defineTable({
    userId: v.string(),
    goal: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    interval: v.number(),
    reminderActive: v.boolean(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  waterEntries: defineTable({
    userId: v.string(),
    dateKey: v.string(),
    amount: v.number(),
    createdAt: v.number(),
  })
    .index("by_user_date", ["userId", "dateKey"])
    .index("by_user_created", ["userId", "createdAt"]),
  achievements: defineTable({
    userId: v.string(),
    dateKey: v.string(),
    createdAt: v.number(),
  }).index("by_user_date", ["userId", "dateKey"]),
});
