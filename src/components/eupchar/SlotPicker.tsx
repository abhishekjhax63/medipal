import { useMemo } from "react";
import { CalendarClock, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDayLabel, formatTime } from "@/lib/eupchar/format";
import { isSlotTaken, selectSlots } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { E_UPCHAR_COPY, type AppointmentSlot } from "@/types/eupchar";
import { EuNotice } from "@/components/eupchar/ui";

type DayGroup = { key: string; label: ReturnType<typeof formatDayLabel>; slots: readonly AppointmentSlot[] };

/**
 * Appointment slot chooser (spec §12).
 *
 * With no scheduling integration configured there are genuinely no slots, so the
 * screen says exactly that instead of inventing times. Practice mode supplies
 * clearly-labelled placeholder slots so the funnel stays walkable.
 */
export function SlotPicker({
  hospitalId,
  serviceId,
  selectedStartsAt,
  selectedEndsAt,
  onSelect,
}: {
  hospitalId: string;
  serviceId: string;
  selectedStartsAt: string | null;
  selectedEndsAt: string | null;
  onSelect: (slot: AppointmentSlot | null) => void;
}) {
  const state = useEuState();
  const slots = useMemo(
    () => selectSlots(hospitalId, serviceId, state),
    [hospitalId, serviceId, state],
  );
  const practice = state.practiceMode;

  const groups = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, AppointmentSlot[]>();
    for (const slot of slots) {
      const key = slot.startsAt.slice(0, 10);
      const list = byDay.get(key) ?? [];
      list.push(slot);
      byDay.set(key, list);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, daySlots]) => ({
        key,
        label: formatDayLabel(`${key}T00:00:00`),
        slots: daySlots.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      }));
  }, [slots]);

  const hasOpenSlot = groups.some((group) =>
    group.slots.some((slot) => !isSlotTaken(hospitalId, serviceId, slot.startsAt, state)),
  );

  if (slots.length === 0) {
    return (
      <EuNotice tone="warn" title={E_UPCHAR_COPY.schedulingNotConnected}>
        You can still send a booking request. The hospital's front desk will confirm a time with you
        directly, or you can call the hospital using the number on its profile.
      </EuNotice>
    );
  }

  return (
    <div className="space-y-5">
      {practice && (
        <EuNotice tone="practice">
          These appointment times are labelled practice placeholders. No hospital diary is connected,
          so no real appointment exists until a hospital confirms it.
        </EuNotice>
      )}

      {!hasOpenSlot && (
        <EuNotice tone="warn" title="No open slots are showing">
          Every available time for this service is currently taken. Try a later day, or send a
          booking request and the hospital will confirm a time with you.
        </EuNotice>
      )}

      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5 text-eu-muted" aria-hidden />
              <p className="text-[0.8rem] font-semibold text-eu-text">
                {group.label.weekday}, {group.label.day} {group.label.month}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.slots.map((slot) => {
                const taken = isSlotTaken(hospitalId, serviceId, slot.startsAt, state);
                const isSelected = slot.startsAt === selectedStartsAt;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={taken}
                    onClick={() => onSelect(isSelected ? null : slot)}
                    aria-pressed={isSelected}
                    className={cn(
                      "eu-btn gap-1.5 border px-3 py-2 text-[0.78rem]",
                      isSelected
                        ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep"
                        : taken
                          ? "cursor-not-allowed border-eu-border bg-eu-surface text-eu-muted/60 line-through"
                          : "border-eu-border bg-eu-bg text-eu-text hover:border-eu-red hover:text-eu-red-deep",
                    )}
                  >
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {formatTime(slot.startsAt)}
                    {taken && <span className="sr-only">(already booked)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedStartsAt && (
        <p className="text-[0.8rem] text-eu-muted">
          Selected: <span className="font-medium text-eu-text">{formatTime(selectedStartsAt)}</span>
          {selectedEndsAt ? ` – ${formatTime(selectedEndsAt)}` : ""}. The slot is held while you
          complete checkout.
        </p>
      )}
    </div>
  );
}
