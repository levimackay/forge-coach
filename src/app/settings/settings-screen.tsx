"use client";

import { ScreenBar } from "@/components/shell/screen-bar";
import { SyncChip } from "@/components/shell/sync-chip";
import { named } from "@/components/ui";
import { AboutSection } from "./about-section";
import { AccountSection } from "./account-section";
import { DataSection } from "./data-section";
import { EquipmentSection } from "./equipment-section";
import { GoalsSection } from "./goals-section";
import { InstallSection } from "./install-section";
import { ProfileSection } from "./profile-section";

export function SettingsScreen() {
  return (
    <div className="flex flex-col gap-10 pb-6">
      <ScreenBar tall start={<h1 className="text-head">{named("Settings")}</h1>} end={<SyncChip align="end" />} />
      <ProfileSection />
      <EquipmentSection />
      <GoalsSection />
      <DataSection />
      <InstallSection />
      <AboutSection />
      <AccountSection />
    </div>
  );
}
