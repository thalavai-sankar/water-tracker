"use client";

import {
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import {
  BellRing,
  BellOff,
  Droplets,
  GlassWater,
  History,
  RotateCcw,
  Settings2,
  Target,
  Trophy,
  Undo2,
  UserRound,
} from "lucide-react";
import { anyApi } from "convex/server";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "water-tracker-state-v2";

type Entry = {
  amount: number;
  createdAt: string;
};

type TrackerState = {
  goal: number;
  startTime: string;
  endTime: string;
  interval: number;
  reminderActive: boolean;
  nextReminderAt?: number;
  entriesByDate: Record<string, Entry[]>;
  achievedDates: string[];
};

const defaults: TrackerState = {
  goal: 2500,
  startTime: "08:00",
  endTime: "22:00",
  interval: 60,
  reminderActive: false,
  nextReminderAt: undefined,
  entriesByDate: {},
  achievedDates: [],
};

const quickAmounts = [
  { amount: 150, label: "Small glass" },
  { amount: 250, label: "Glass" },
  { amount: 500, label: "Bottle" },
  { amount: 750, label: "Large bottle" },
];

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const backendConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL && clerkConfigured);
const convexApi = anyApi as any;

type ReminderSettings = Pick<TrackerState, "goal" | "startTime" | "endTime" | "interval" | "reminderActive" | "nextReminderAt">;

type CloudData = {
  settings: ReminderSettings;
  entries: { amount: number; createdAt: number }[];
  achievedDates: string[];
};

type CloudAdapter = {
  data?: CloudData;
  addEntry: (args: { amount: number; dateKey: string }) => Promise<unknown>;
  markAchieved: (args: { dateKey: string }) => Promise<unknown>;
  resetToday: (args: { dateKey: string }) => Promise<unknown>;
  saveSettings: (args: ReminderSettings) => Promise<unknown>;
  undoLastEntry: (args: { dateKey: string }) => Promise<unknown>;
};

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function formatMl(amount: number) {
  return `${Math.max(0, Math.round(amount))} ml`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function dateAtTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function getNextReminderDate(state: TrackerState) {
  const now = new Date();
  const start = dateAtTime(state.startTime);
  const end = dateAtTime(state.endTime);
  const intervalMs = state.interval * 60 * 1000;

  if (now < start) return start;
  if (now > end) {
    const tomorrow = dateAtTime(state.startTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const elapsedIntervals = Math.ceil((now.getTime() - start.getTime()) / intervalMs);
  const next = new Date(start.getTime() + elapsedIntervals * intervalMs);
  if (next <= end) return next;

  const tomorrow = dateAtTime(state.startTime);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

function loadInitialState(): TrackerState {
  if (typeof window === "undefined") return defaults;

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "");
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

export default function Page() {
  if (!backendConfigured) {
    return (
      <TrackerApp
        authSlot={<AccountControl />}
        setupBanner={
          <SetupBanner
            title={clerkConfigured ? "Convex setup needed" : "Clerk and Convex setup needed"}
            body={
              clerkConfigured
                ? "Clerk is ready for account controls. Add the Convex environment value, then restart the dev server to enable cloud sync."
                : "The app is running in local mode. Add the environment values from Clerk and Convex, then restart the dev server to enable cloud sync and authenticated data."
            }
          />
        }
      />
    );
  }

  return (
    <AuthenticatedPage />
  );
}

function AuthenticatedPage() {
  const { isLoaded, isSignedIn } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();

  if (!isLoaded || (isSignedIn && isConvexAuthLoading)) {
    return <TrackerApp authSlot={<AccountControl />} />;
  }

  if (!isSignedIn) {
    return (
      <TrackerApp
        authSlot={<AccountControl />}
        setupBanner={
          <InfoBanner
            title="Explore in guest mode"
            body="Your progress is saved in this browser for now. Sign in from the profile icon when you want Convex cloud sync across sessions."
          />
        }
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <TrackerApp
        authSlot={<AccountControl />}
        setupBanner={
          <SetupBanner
            title="Convex auth setup needed"
            body="You are signed in with Clerk, but Convex is not receiving a valid Clerk token yet. Activate the Convex integration in Clerk, then refresh this page."
          />
        }
      />
    );
  }

  return <CloudHydrationApp />;
}

function CloudHydrationApp() {
  const dateKey = todayKey();
  const data = useQuery(convexApi.water.getToday, { dateKey }) as CloudData | undefined;
  const addEntry = useMutation(convexApi.water.addEntry);
  const markAchieved = useMutation(convexApi.water.markAchieved);
  const resetToday = useMutation(convexApi.water.resetToday);
  const saveSettings = useMutation(convexApi.water.saveSettings);
  const undoLastEntry = useMutation(convexApi.water.undoLastEntry);

  return (
    <TrackerApp
      authSlot={<AccountControl />}
      cloud={{ addEntry, data, markAchieved, resetToday, saveSettings, undoLastEntry }}
    />
  );
}

function AccountControl() {
  if (!clerkConfigured) {
    return (
      <button
        aria-label="Add Clerk keys to enable account profile"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 shadow-sm"
        title="Add Clerk keys to enable sign in and profile"
        type="button"
      >
        <UserRound className="h-4 w-4" />
      </button>
    );
  }

  return <ClerkAccountControl />;
}

function ClerkAccountControl() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div
        aria-label="Checking account"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm"
      >
        <UserRound className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end">
      {isSignedIn ? (
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-10 w-10 border border-slate-200 shadow-sm",
              userButtonPopoverCard: "rounded-lg border border-slate-200 shadow-xl",
            },
          }}
        />
      ) : (
        <SignInButton mode="redirect">
          <button
            aria-label="Sign in to your account"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            type="button"
          >
            <UserRound className="h-4 w-4" />
          </button>
        </SignInButton>
      )}
    </div>
  );
}

function TrackerApp({
  authSlot,
  cloud,
  setupBanner,
}: {
  authSlot?: ReactNode;
  cloud?: CloudAdapter;
  setupBanner?: ReactNode;
}) {
  const [state, setState] = useState<TrackerState>(defaults);
  const [isReady, setIsReady] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dateKey = todayKey();
  const entries = state.entriesByDate[dateKey] ?? [];
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const progress = Math.min(total / state.goal, 1);
  const percent = Math.round(progress * 100);
  const remaining = Math.max(0, state.goal - total);
  const nextReminder = useMemo(() => getNextReminderDate(state), [state]);

  const paceSuggestion = useMemo(() => {
    const now = new Date();
    const start = minutesFromTime(state.startTime);
    const end = minutesFromTime(state.endTime);
    const current = now.getHours() * 60 + now.getMinutes();
    const activeMinutes = Math.max(1, end - start);
    const elapsed = Math.min(Math.max(current - start, 0), activeMinutes);
    const expected = Math.round((elapsed / activeMinutes) * state.goal);
    return Math.max(0, expected - total);
  }, [state.endTime, state.goal, state.startTime, total]);

  const streak = useMemo(() => {
    let count = 0;
    const cursor = new Date();
    while (state.achievedDates.includes(todayKey(cursor))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [state.achievedDates]);

  useEffect(() => {
    setState(loadInitialState());
    setIsReady(true);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        setMessage("Notifications work best after the app is served from localhost or HTTPS.");
      });
    }
  }, []);

  useEffect(() => {
    if (!cloud?.data) return;
    setState({
      ...state,
      ...cloud.data.settings,
      entriesByDate: {
        ...state.entriesByDate,
        [dateKey]: cloud.data.entries.map((entry) => ({
          amount: entry.amount,
          createdAt: new Date(entry.createdAt).toISOString(),
        })),
      },
      achievedDates: cloud.data.achievedDates,
    });
    // Convex data is the source of truth in cloud mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud?.data, dateKey]);

  useEffect(() => {
    if (!isReady) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [isReady, state]);

  useEffect(() => {
    if (!state.reminderActive) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const schedule = () => {
      const next = getNextReminderDate(state);
      const delay = Math.max(1000, next.getTime() - Date.now());

      timerRef.current = setTimeout(() => {
        const reminderText = `Time for water. ${formatMl(Math.max(0, state.goal - total))} left for today.`;
        if ("Notification" in window && Notification.permission === "granted") {
          navigator.serviceWorker
            ?.getRegistration()
            .then((registration) => {
              if (registration) {
                registration.showNotification("Hydration reminder", {
                  body: reminderText,
                  badge: "/icon.svg",
                  icon: "/icon.svg",
                  tag: "hydration-reminder",
                });
                return;
              }
              new Notification("Hydration reminder", { body: reminderText });
            })
            .catch(() => new Notification("Hydration reminder", { body: reminderText }));
        } else {
          setMessage(reminderText);
        }
        cloud?.saveSettings(toReminderSettings(withReminderTimestamp(state))).catch(() => undefined);
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cloud, state, total]);

  function updateState(nextState: TrackerState) {
    setState(nextState);
  }

  function withReminderTimestamp(nextState: TrackerState): TrackerState {
    return {
      ...nextState,
      nextReminderAt: nextState.reminderActive ? getNextReminderDate(nextState).getTime() : undefined,
    };
  }

  function toReminderSettings(nextState: TrackerState): ReminderSettings {
    return {
      goal: nextState.goal,
      startTime: nextState.startTime,
      endTime: nextState.endTime,
      interval: nextState.interval,
      reminderActive: nextState.reminderActive,
      nextReminderAt: nextState.nextReminderAt,
    };
  }

  function saveReminderSettings(nextState: TrackerState, successMessage?: string) {
    const settings = withReminderTimestamp(nextState);
    updateState(settings);

    if (!cloud) {
      if (successMessage) setMessage(successMessage);
      return;
    }

    cloud
      .saveSettings(toReminderSettings(settings))
      .then(() => {
        if (successMessage) setMessage(successMessage);
      })
      .catch(() => setMessage("Reminder saved locally, but backend sync failed."));
  }

  function addWater(amount: number) {
    const before = total;
    const after = before + amount;
    const nextEntries = [...entries, { amount, createdAt: new Date().toISOString() }];
    const achievedDates =
      before < state.goal && after >= state.goal && !state.achievedDates.includes(dateKey)
        ? [...state.achievedDates, dateKey]
        : state.achievedDates;

    updateState({
      ...state,
      entriesByDate: { ...state.entriesByDate, [dateKey]: nextEntries },
      achievedDates,
    });

    if (before < state.goal && after >= state.goal) {
      setMessage("Daily goal reached. Nicely done.");
      cloud?.markAchieved({ dateKey }).catch(() => setMessage("Saved locally, but cloud achievement sync failed."));
    }
    cloud?.addEntry({ amount, dateKey }).catch(() => setMessage("Saved locally, but cloud sync failed."));
  }

  function undoLast() {
    const nextEntries = entries.slice(0, -1);
    const nextTotal = nextEntries.reduce((sum, entry) => sum + entry.amount, 0);
    updateState({
      ...state,
      entriesByDate: { ...state.entriesByDate, [dateKey]: nextEntries },
      achievedDates:
        nextTotal < state.goal ? state.achievedDates.filter((day) => day !== dateKey) : state.achievedDates,
    });
    cloud?.undoLastEntry({ dateKey }).catch(() => setMessage("Updated locally, but cloud undo failed."));
  }

  function resetToday() {
    updateState({
      ...state,
      entriesByDate: { ...state.entriesByDate, [dateKey]: [] },
      achievedDates: state.achievedDates.filter((day) => day !== dateKey),
    });
    cloud?.resetToday({ dateKey }).catch(() => setMessage("Reset locally, but cloud reset failed."));
    setMessage("Today has been reset.");
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setMessage("This browser does not support desktop notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    setMessage(
      permission === "granted"
        ? "Laptop web notifications are enabled. Keep this app open for scheduled reminders."
        : "Notifications are blocked. Tracking still works here.",
    );
  }

  function handleCustomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(customAmount);
    if (!amount || amount < 1) return;
    addWater(amount);
    setCustomAmount("");
  }

  const progressHint =
    remaining === 0
      ? "You hit your goal. Keep sipping gently if you feel thirsty."
      : paceSuggestion > 0
        ? `${formatMl(paceSuggestion)} gets you back on pace for the day.`
        : "You are on pace. Small, steady sips are working.";
  const displayDate = isReady ? new Date() : null;

  return (
    <main className="mx-auto min-h-screen w-[min(1120px,calc(100%-32px))] py-8 text-slate-950 max-sm:w-[min(100%-24px,1120px)]">
      <section className="mb-8 flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
        <div>
          <p className="text-sm font-medium text-slate-500">Hydration companion</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Water Tracker</h1>
        </div>
        <div className="flex items-center gap-4 max-sm:w-full max-sm:justify-between">
          <div className="text-right max-sm:text-left">
            <span className="block text-sm text-slate-500">
              {displayDate ? displayDate.toLocaleDateString([], { weekday: "long" }) : "Today"}
            </span>
            <strong className="text-sm font-semibold">
              {displayDate ? displayDate.toLocaleDateString([], { month: "short", day: "numeric" }) : "--"}
            </strong>
          </div>
          {authSlot}
        </div>
      </section>

      {setupBanner}

      <section className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)] gap-4 max-lg:grid-cols-1">
        <article className="grid grid-cols-[minmax(0,1fr)_220px] gap-8 rounded-lg border border-slate-200 bg-white p-6 max-lg:grid-cols-1 max-sm:p-5">
          <div>
            <div className="flex items-start justify-between gap-4 max-sm:flex-col">
              <div>
                <p className="text-sm font-medium text-slate-500">Daily progress</p>
                <h2 className="mt-2 text-5xl font-semibold tracking-tight max-sm:text-4xl">{percent}%</h2>
              </div>
              <div className="rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600">
                {formatMl(total)} / {formatMl(state.goal)}
              </div>
            </div>
            <div className="mt-8 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-sky-600 transition-[width] duration-700 ease-out" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-5 max-w-2xl leading-7 text-slate-600">{progressHint}</p>
          </div>

          <div className="flex items-center justify-center rounded-lg bg-slate-50 p-4 max-lg:hidden">
            <HydrationIllustration />
          </div>

          <div className="col-span-2 grid grid-cols-3 gap-3 max-lg:col-span-1 max-sm:grid-cols-1">
            <Stat icon={<Target className="h-4 w-4" />} label="Remaining" value={formatMl(remaining)} />
            <Stat icon={<Droplets className="h-4 w-4" />} label="Suggested now" value={formatMl(paceSuggestion)} />
            <Stat icon={<Trophy className="h-4 w-4" />} label="Streak" value={`${streak} day${streak === 1 ? "" : "s"}`} />
          </div>
        </article>
        <ReminderPanel
          active={state.reminderActive}
          canSave={Boolean(cloud)}
          nextReminder={nextReminder}
          onNotify={requestNotifications}
          onSave={() => saveReminderSettings(state, "Reminder schedule saved to the backend.")}
          onStart={() => {
            saveReminderSettings({ ...state, reminderActive: true }, "Reminder started and saved.");
          }}
          onStop={() => {
            saveReminderSettings({ ...state, reminderActive: false }, "Reminder stopped and saved.");
          }}
        />
      </section>

      <section className="mt-4 grid grid-cols-[minmax(280px,0.95fr)_minmax(300px,0.95fr)_minmax(320px,1.1fr)] gap-4 max-lg:grid-cols-1">
        <Panel
          eyebrow="Log water"
          title="Quick add"
          icon={<GlassWater className="h-5 w-5" />}
          action={
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300"
              disabled={!entries.length}
              type="button"
              onClick={undoLast}
            >
              <Undo2 className="h-4 w-4" />
              Undo
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            {quickAmounts.map((item) => (
              <button
                className="min-h-20 rounded-lg border border-slate-200 bg-white p-3 text-left font-semibold transition hover:border-sky-300 hover:bg-sky-50/40"
                key={item.amount}
                type="button"
                onClick={() => addWater(item.amount)}
              >
                +{item.amount} ml
                <span className="mt-1 block text-sm font-normal text-slate-500">{item.label}</span>
              </button>
            ))}
          </div>
          <form className="grid gap-3" onSubmit={handleCustomSubmit}>
            <label className="grid gap-2 text-sm font-medium text-slate-500" htmlFor="customAmount">
              Custom amount
            </label>
            <div className="flex gap-3 max-sm:flex-col">
              <input
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 outline-none transition focus:border-sky-500"
                id="customAmount"
                max={2000}
                min={1}
                placeholder="350"
                step={25}
                type="number"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
              />
              <button className="min-h-11 rounded-lg bg-slate-950 px-5 font-semibold text-white transition hover:bg-slate-800" type="submit">
                Add ml
              </button>
            </div>
          </form>
          <p className="min-h-6 text-sm font-medium text-sky-700" role="status" aria-live="polite">
            {message}
          </p>
        </Panel>

        <Panel
          eyebrow="Personalize"
          title="Goal and schedule"
          icon={<Settings2 className="h-5 w-5" />}
          action={
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300"
              type="button"
              onClick={resetToday}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <NumberField
              label="Daily goal"
              max={8000}
              min={500}
              step={100}
              suffix="ml"
              value={state.goal}
              onChange={(goal) => {
                saveReminderSettings({ ...state, goal });
              }}
            />
            <TimeField
              label="Wake time"
              value={state.startTime}
              onChange={(startTime) => {
                saveReminderSettings({ ...state, startTime });
              }}
            />
            <TimeField
              label="Wind down"
              value={state.endTime}
              onChange={(endTime) => {
                saveReminderSettings({ ...state, endTime });
              }}
            />
            <NumberField
              label="Remind every"
              max={240}
              min={15}
              step={5}
              suffix="min"
              value={state.interval}
              onChange={(interval) => {
                saveReminderSettings({ ...state, interval });
              }}
            />
          </div>
        </Panel>

        <Panel eyebrow="Today" title="Hydration rhythm" icon={<History className="h-5 w-5" />}>
          <div className="grid max-h-60 gap-2 overflow-auto pr-1">
            {entries.length === 0 ? (
              <TimelineItem amount={0} label="No drinks logged yet" time="Every glass counts" />
            ) : (
              entries
                .slice()
                .reverse()
                .map((entry) => (
                  <TimelineItem
                    amount={entry.amount}
                    key={`${entry.createdAt}-${entry.amount}`}
                    label={`${entry.amount} ml`}
                    time={formatTime(new Date(entry.createdAt))}
                  />
                ))
            )}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function HydrationIllustration() {
  return (
    <svg className="h-48 w-48" viewBox="0 0 220 220" fill="none" aria-hidden="true">
      <path
        d="M47 140C70 112 93 105 122 121C145 134 166 130 185 111"
        stroke="#2563eb"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M73 68C99 82 126 84 154 71"
        stroke="#f6b64b"
        strokeWidth="16"
        strokeLinecap="square"
      />
      <path d="M89 82V153" stroke="#2563eb" strokeWidth="16" strokeLinecap="square" />
      <path d="M126 71C126 103 112 122 93 126" stroke="#2563eb" strokeWidth="14" strokeLinecap="square" />
      <path
        d="M140 88C148 111 166 119 187 108"
        stroke="#ef2f24"
        strokeWidth="17"
        strokeLinecap="square"
      />
      <circle cx="164" cy="55" r="13" fill="#020617" />
      <circle cx="72" cy="53" r="9" fill="#ef2f24" />
      <circle cx="143" cy="88" r="10" fill="#f6b64b" />
      <path d="M62 38H89V57L62 49V38Z" fill="#ef2f24" />
      <path
        d="M108 42C122 57 135 77 135 96C135 113 124 124 108 124C92 124 81 113 81 96C81 77 94 57 108 42Z"
        fill="#ffffff"
        stroke="#e2e8f0"
        strokeWidth="3"
      />
      <path d="M91 101C99 108 116 109 126 100V104C126 116 118 123 108 123C98 123 91 116 91 104V101Z" fill="#38bdf8" />
      <circle cx="186" cy="111" r="8" fill="#38bdf8" />
    </svg>
  );
}

function SetupBanner({ body, title }: { body: string; title: string }) {
  return (
    <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <strong className="block font-semibold">{title}</strong>
      <p className="mt-1 leading-6">{body}</p>
    </section>
  );
}

function InfoBanner({ body, title }: { body: string; title: string }) {
  return (
    <section className="mb-4 rounded-lg border border-sky-100 bg-sky-50 p-4 text-sky-950">
      <strong className="block font-semibold">{title}</strong>
      <p className="mt-1 leading-6">{body}</p>
    </section>
  );
}

function ReminderPanel({
  active,
  canSave,
  nextReminder,
  onNotify,
  onSave,
  onStart,
  onStop,
}: {
  active: boolean;
  canSave: boolean;
  nextReminder: Date;
  onNotify: () => void;
  onSave: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <article className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-6 max-sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Next reminder</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">{active ? formatTime(nextReminder) : "Paused"}</h2>
        </div>
        <button
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
          title="Enable notifications"
          type="button"
          aria-label="Enable notifications"
          onClick={onNotify}
        >
          {active ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </button>
      </div>
      <p className="leading-7 text-slate-600">
        {active
          ? "Laptop web notifications are active while this app stays open."
          : "Allow browser notifications, choose your schedule, then start hydration nudges."}
      </p>
      <div className="flex gap-3 max-sm:flex-col">
        <button className="min-h-11 rounded-lg bg-slate-950 px-5 font-semibold text-white transition hover:bg-slate-800" type="button" onClick={onStart}>
          Start
        </button>
        <button className="min-h-11 rounded-lg border border-slate-200 bg-white px-5 font-semibold text-slate-700 transition hover:border-slate-300" type="button" onClick={onStop}>
          Stop
        </button>
        {canSave ? (
          <button
            className="min-h-11 rounded-lg border border-sky-200 bg-sky-50 px-5 font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100"
            type="button"
            onClick={onSave}
          >
            Save schedule
          </button>
        ) : null}
      </div>
    </article>
  );
}

function Panel({
  action,
  children,
  eyebrow,
  icon,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  eyebrow: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <article className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-6 max-sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">{icon}</span>
          <div>
            <p className="text-sm font-medium text-slate-500">{eyebrow}</p>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          </div>
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  step,
  suffix,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  suffix: string;
  value: number;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-500">
      {label}
      <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-lg border border-slate-200 bg-white transition focus-within:border-sky-500">
        <input
          className="min-h-11 min-w-0 rounded-lg bg-transparent px-3 text-slate-900 outline-none"
          max={max}
          min={min}
          step={step}
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || min)}
        />
        <span className="pr-3 font-medium text-slate-500">{suffix}</span>
      </span>
    </label>
  );
}

function TimeField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-500">
      {label}
      <input
        className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 outline-none transition focus:border-sky-500"
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-h-24 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </span>
      <strong className="mt-2 block text-lg font-semibold">{value}</strong>
    </div>
  );
}

function TimelineItem({ amount, label, time }: { amount: number; label: string; time: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-sky-50 text-sky-700">
        <Droplets className="h-4 w-4" />
      </span>
      <div>
        <strong className="text-sm font-semibold">{label}</strong>
        <time className="block text-xs font-medium text-slate-500">{time}</time>
      </div>
      <strong className="text-sm font-semibold">{amount ? `+${amount}` : "0 ml"}</strong>
    </div>
  );
}
