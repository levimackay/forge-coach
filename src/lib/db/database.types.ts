export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string
          at: string
          client_id: string | null
          details: Json
          entity: string
          entity_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          actor: string
          at?: string
          client_id?: string | null
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string
        }
        Update: {
          action?: string
          actor?: string
          at?: string
          client_id?: string | null
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          arm: number | null
          body_fat_pct: number | null
          bodyweight: number | null
          chest: number | null
          created_at: string
          deleted_at: string | null
          id: string
          measured_on: string
          notes: string | null
          server_updated_at: string
          thigh: number | null
          updated_at: string
          user_id: string
          waist: number | null
        }
        Insert: {
          arm?: number | null
          body_fat_pct?: number | null
          bodyweight?: number | null
          chest?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          measured_on: string
          notes?: string | null
          server_updated_at?: string
          thigh?: number | null
          updated_at?: string
          user_id?: string
          waist?: number | null
        }
        Update: {
          arm?: number | null
          body_fat_pct?: number | null
          bodyweight?: number | null
          chest?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          measured_on?: string
          notes?: string | null
          server_updated_at?: string
          thigh?: number | null
          updated_at?: string
          user_id?: string
          waist?: number | null
        }
        Relationships: []
      }
      coach_proposals: {
        Row: {
          applied_at: string | null
          base_program_version: number
          changes: Json
          client_id: string | null
          created_at: string
          decided_at: string | null
          decision_note: string | null
          id: string
          inverse_changes: Json | null
          program_id: string
          rationale: string
          server_updated_at: string
          source: string
          status: string
          title: string
          undone_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          base_program_version: number
          changes: Json
          client_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          id?: string
          inverse_changes?: Json | null
          program_id: string
          rationale: string
          server_updated_at?: string
          source?: string
          status?: string
          title: string
          undone_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          applied_at?: string | null
          base_program_version?: number
          changes?: Json
          client_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          id?: string
          inverse_changes?: Json | null
          program_id?: string
          rationale?: string
          server_updated_at?: string
          source?: string
          status?: string
          title?: string
          undone_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_proposals_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_profiles: {
        Row: {
          barbell_increment: number | null
          created_at: string
          deleted_at: string | null
          dumbbell_increment: number | null
          dumbbell_max: number | null
          equipment: string[]
          id: string
          is_default: boolean
          name: string
          server_updated_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          barbell_increment?: number | null
          created_at?: string
          deleted_at?: string | null
          dumbbell_increment?: number | null
          dumbbell_max?: number | null
          equipment?: string[]
          id?: string
          is_default?: boolean
          name: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          barbell_increment?: number | null
          created_at?: string
          deleted_at?: string | null
          dumbbell_increment?: number | null
          dumbbell_max?: number | null
          equipment?: string[]
          id?: string
          is_default?: boolean
          name?: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          created_at: string
          default_increment: number | null
          default_rep_max: number
          default_rep_min: number
          deleted_at: string | null
          equipment: string[]
          id: string
          ladder_level: number | null
          load_type: string
          movement_pattern: string
          name: string
          notes: string | null
          primary_muscle: string
          progression_group: string | null
          secondary_muscles: string[]
          server_updated_at: string
          slug: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          default_increment?: number | null
          default_rep_max: number
          default_rep_min: number
          deleted_at?: string | null
          equipment?: string[]
          id?: string
          ladder_level?: number | null
          load_type: string
          movement_pattern: string
          name: string
          notes?: string | null
          primary_muscle: string
          progression_group?: string | null
          secondary_muscles?: string[]
          server_updated_at?: string
          slug: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          default_increment?: number | null
          default_rep_max?: number
          default_rep_min?: number
          deleted_at?: string | null
          equipment?: string[]
          id?: string
          ladder_level?: number | null
          load_type?: string
          movement_pattern?: string
          name?: string
          notes?: string | null
          primary_muscle?: string
          progression_group?: string | null
          secondary_muscles?: string[]
          server_updated_at?: string
          slug?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      goals: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          description: string
          focus_muscles: string[]
          id: string
          kind: string
          server_updated_at: string
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          description: string
          focus_muscles?: string[]
          id?: string
          kind: string
          server_updated_at?: string
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          description?: string
          focus_muscles?: string[]
          id?: string
          kind?: string
          server_updated_at?: string
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      planned_exercises: {
        Row: {
          created_at: string
          deleted_at: string | null
          exercise_id: string
          id: string
          is_active: boolean
          load: number | null
          notes: string | null
          position: number
          program_day_id: string
          rep_max: number
          rep_min: number
          rest_seconds: number | null
          server_updated_at: string
          sets: number
          target_rir: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          exercise_id: string
          id?: string
          is_active?: boolean
          load?: number | null
          notes?: string | null
          position: number
          program_day_id: string
          rep_max: number
          rep_min: number
          rest_seconds?: number | null
          server_updated_at?: string
          sets: number
          target_rir: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          exercise_id?: string
          id?: string
          is_active?: boolean
          load?: number | null
          notes?: string | null
          position?: number
          program_day_id?: string
          rep_max?: number
          rep_min?: number
          rest_seconds?: number | null
          server_updated_at?: string
          sets?: number
          target_rir?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_exercises_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bodyweight: number | null
          created_at: string
          display_name: string | null
          onboarded_at: string | null
          server_updated_at: string
          timezone: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bodyweight?: number | null
          created_at?: string
          display_name?: string | null
          onboarded_at?: string | null
          server_updated_at?: string
          timezone?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          bodyweight?: number | null
          created_at?: string
          display_name?: string | null
          onboarded_at?: string | null
          server_updated_at?: string
          timezone?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      program_days: {
        Row: {
          created_at: string
          deleted_at: string | null
          equipment_profile_id: string | null
          focus: string
          id: string
          name: string
          position: number
          program_id: string
          server_updated_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          equipment_profile_id?: string | null
          focus: string
          id?: string
          name: string
          position: number
          program_id: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          equipment_profile_id?: string | null
          focus?: string
          id?: string
          name?: string
          position?: number
          program_id?: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_days_equipment_profile_id_fkey"
            columns: ["equipment_profile_id"]
            isOneToOne: false
            referencedRelation: "equipment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          created_at: string
          days_per_week: number
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          server_updated_at: string
          split: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          days_per_week: number
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          server_updated_at?: string
          split: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Update: {
          created_at?: string
          days_per_week?: number
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          server_updated_at?: string
          split?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      progression_decisions: {
        Row: {
          action: string
          after: Json
          before: Json
          created_at: string
          decided_at: string
          deleted_at: string | null
          engine_version: string
          id: string
          inputs: Json
          planned_exercise_id: string
          reason: string
          server_updated_at: string
          updated_at: string
          user_id: string
          workout_id: string | null
        }
        Insert: {
          action: string
          after: Json
          before: Json
          created_at?: string
          decided_at?: string
          deleted_at?: string | null
          engine_version: string
          id?: string
          inputs?: Json
          planned_exercise_id: string
          reason: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
          workout_id?: string | null
        }
        Update: {
          action?: string
          after?: Json
          before?: Json
          created_at?: string
          decided_at?: string
          deleted_at?: string | null
          engine_version?: string
          id?: string
          inputs?: Json
          planned_exercise_id?: string
          reason?: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "progression_decisions_planned_exercise_id_fkey"
            columns: ["planned_exercise_id"]
            isOneToOne: false
            referencedRelation: "planned_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progression_decisions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_logs: {
        Row: {
          created_at: string
          date: string
          deleted_at: string | null
          energy: number | null
          id: string
          notes: string | null
          server_updated_at: string
          sleep_hours: number | null
          sleep_quality: number | null
          soreness: number | null
          stress: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          deleted_at?: string | null
          energy?: number | null
          id?: string
          notes?: string | null
          server_updated_at?: string
          sleep_hours?: number | null
          sleep_quality?: number | null
          soreness?: number | null
          stress?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          deleted_at?: string | null
          energy?: number | null
          id?: string
          notes?: string | null
          server_updated_at?: string
          sleep_hours?: number | null
          sleep_quality?: number | null
          soreness?: number | null
          stress?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_sets: {
        Row: {
          completed_at: string
          created_at: string
          deleted_at: string | null
          exercise_id: string
          id: string
          is_warmup: boolean
          load: number | null
          notes: string | null
          pain: boolean
          planned_exercise_id: string | null
          reps: number
          rir: number | null
          server_updated_at: string
          set_index: number
          updated_at: string
          user_id: string
          workout_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          deleted_at?: string | null
          exercise_id: string
          id?: string
          is_warmup?: boolean
          load?: number | null
          notes?: string | null
          pain?: boolean
          planned_exercise_id?: string | null
          reps: number
          rir?: number | null
          server_updated_at?: string
          set_index: number
          updated_at?: string
          user_id?: string
          workout_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          deleted_at?: string | null
          exercise_id?: string
          id?: string
          is_warmup?: boolean
          load?: number | null
          notes?: string | null
          pain?: boolean
          planned_exercise_id?: string | null
          reps?: number
          rir?: number | null
          server_updated_at?: string
          set_index?: number
          updated_at?: string
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_planned_exercise_id_fkey"
            columns: ["planned_exercise_id"]
            isOneToOne: false
            referencedRelation: "planned_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          equipment_profile_id: string | null
          id: string
          notes: string | null
          program_day_id: string | null
          server_updated_at: string
          session_rpe: number | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          equipment_profile_id?: string | null
          id?: string
          notes?: string | null
          program_day_id?: string | null
          server_updated_at?: string
          session_rpe?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          equipment_profile_id?: string | null
          id?: string
          notes?: string | null
          program_day_id?: string | null
          server_updated_at?: string
          session_rpe?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_equipment_profile_id_fkey"
            columns: ["equipment_profile_id"]
            isOneToOne: false
            referencedRelation: "equipment_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_proposal: {
        Args: { p_id: string }
        Returns: {
          applied_at: string | null
          base_program_version: number
          changes: Json
          client_id: string | null
          created_at: string
          decided_at: string | null
          decision_note: string | null
          id: string
          inverse_changes: Json | null
          program_id: string
          rationale: string
          server_updated_at: string
          source: string
          status: string
          title: string
          undone_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "coach_proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_proposal: {
        Args: { p_id: string; p_note?: string }
        Returns: {
          applied_at: string | null
          base_program_version: number
          changes: Json
          client_id: string | null
          created_at: string
          decided_at: string | null
          decision_note: string | null
          id: string
          inverse_changes: Json | null
          program_id: string
          rationale: string
          server_updated_at: string
          source: string
          status: string
          title: string
          undone_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "coach_proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_my_account: { Args: never; Returns: Json }
      delete_my_data: { Args: never; Returns: Json }
      export_my_data: { Args: never; Returns: Json }
      reject_proposal: {
        Args: { p_id: string; p_note?: string }
        Returns: {
          applied_at: string | null
          base_program_version: number
          changes: Json
          client_id: string | null
          created_at: string
          decided_at: string | null
          decision_note: string | null
          id: string
          inverse_changes: Json | null
          program_id: string
          rationale: string
          server_updated_at: string
          source: string
          status: string
          title: string
          undone_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "coach_proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      undo_proposal: {
        Args: { p_id: string }
        Returns: {
          applied_at: string | null
          base_program_version: number
          changes: Json
          client_id: string | null
          created_at: string
          decided_at: string | null
          decision_note: string | null
          id: string
          inverse_changes: Json | null
          program_id: string
          rationale: string
          server_updated_at: string
          source: string
          status: string
          title: string
          undone_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "coach_proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
