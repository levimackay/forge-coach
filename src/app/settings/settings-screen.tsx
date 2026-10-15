"use client";

import { AboutSection } from "./about-section";
import { AccountSection } from "./account-section";
import { DataSection } from "./data-section";
import { EquipmentSection } from "./equipment-section";
import { GoalsSection } from "./goals-section";
import { InstallSection } from "./install-section";
import { ProfileSection } from "./profile-section";

export function SettingsScreen() {
  return (
    <div className="flex flex-col gap-10 py-4">
      <h1 className="title-large">Settings</h1>
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
