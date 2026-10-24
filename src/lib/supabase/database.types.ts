// Generated from the Supabase project (seamflow / buuyvmasbomxzyrwfkxo). Do not edit by hand:
// regenerate after every migration and note it in CHANGELOG.md.

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
      appeals: {
        Row: {
          attempts: number
          created_at: string
          decided_at: string | null
          id: string
          last_error: string | null
          reason: string
          reviewer_model: string | null
          ruling: string | null
          scan_id: string
          status: string
          user_id: string | null
          visitor_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          decided_at?: string | null
          id?: string
          last_error?: string | null
          reason: string
          reviewer_model?: string | null
          ruling?: string | null
          scan_id: string
          status?: string
          user_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          decided_at?: string | null
          id?: string
          last_error?: string | null
          reason?: string
          reviewer_model?: string | null
          ruling?: string | null
          scan_id?: string
          status?: string
          user_id?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appeals_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor: string
          detail: string
          event: string
          hash: string
          id: number
          occurred_at: string
          prev_hash: string | null
          scan_id: string
        }
        Insert: {
          actor: string
          detail: string
          event: string
          hash: string
          id?: never
          occurred_at?: string
          prev_hash?: string | null
          scan_id: string
        }
        Update: {
          actor?: string
          detail?: string
          event?: string
          hash?: string
          id?: never
          occurred_at?: string
          prev_hash?: string | null
          scan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          code: string
          company_id: string | null
          confidence: number | null
          created_at: string
          id: string
          issued_to: string
          last_verified_at: string | null
          number: string
          policy_clause: string | null
          product_name: string | null
          rating: number | null
          rating_note: string | null
          revoked_at: string | null
          revoked_reason: string | null
          scan_id: string
          sku: string | null
          status: string
          verdict: Database["public"]["Enums"]["verdict"] | null
          verification_count: number
        }
        Insert: {
          code?: string
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          issued_to: string
          last_verified_at?: string | null
          number?: string
          policy_clause?: string | null
          product_name?: string | null
          rating?: number | null
          rating_note?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          scan_id: string
          sku?: string | null
          status?: string
          verdict?: Database["public"]["Enums"]["verdict"] | null
          verification_count?: number
        }
        Update: {
          code?: string
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          issued_to?: string
          last_verified_at?: string | null
          number?: string
          policy_clause?: string | null
          product_name?: string | null
          rating?: number | null
          rating_note?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          scan_id?: string
          sku?: string | null
          status?: string
          verdict?: Database["public"]["Enums"]["verdict"] | null
          verification_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "certificates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: true
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_usage: {
        Row: {
          created_at: string
          id: number
          scan_id: string | null
          scope: string
          scope_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          scan_id?: string | null
          scope: string
          scope_id: string
        }
        Update: {
          created_at?: string
          id?: never
          scan_id?: string | null
          scope?: string
          scope_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_listed: boolean
          name: string
          plan: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_listed?: boolean
          name: string
          plan?: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_listed?: boolean
          name?: string
          plan?: string
          slug?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          ip_hash: string | null
          monthly_volume: string | null
          name: string
          role: string | null
          source: string | null
          use_case: string | null
          user_id: string | null
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          id?: string
          ip_hash?: string | null
          monthly_volume?: string | null
          name: string
          role?: string | null
          source?: string | null
          use_case?: string | null
          user_id?: string | null
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          ip_hash?: string | null
          monthly_volume?: string | null
          name?: string
          role?: string | null
          source?: string | null
          use_case?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          company_role: string | null
          created_at: string
          display_name: string | null
          id: string
          job_title: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          company_role?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          job_title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          company_role?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          job_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          case_number: string
          company_id: string | null
          confidence: number
          created_at: string
          details: Json
          feedback: Database["public"]["Enums"]["scan_feedback"] | null
          feedback_at: string | null
          file_name: string | null
          id: string
          image_bytes: number | null
          image_deleted_at: string | null
          image_mime: string | null
          image_path: string | null
          image_sha256: string | null
          ip_hash: string | null
          is_public: boolean
          latency_ms: number | null
          model: string
          policy_clause: string | null
          rating: number | null
          rating_note: string | null
          region: string | null
          request_id: string | null
          review_status: string | null
          share_slug: string
          summary: string
          user_id: string | null
          verdict: Database["public"]["Enums"]["verdict"]
          visitor_id: string | null
        }
        Insert: {
          case_number?: string
          company_id?: string | null
          confidence: number
          created_at?: string
          details?: Json
          feedback?: Database["public"]["Enums"]["scan_feedback"] | null
          feedback_at?: string | null
          file_name?: string | null
          id?: string
          image_bytes?: number | null
          image_deleted_at?: string | null
          image_mime?: string | null
          image_path?: string | null
          image_sha256?: string | null
          ip_hash?: string | null
          is_public?: boolean
          latency_ms?: number | null
          model: string
          policy_clause?: string | null
          rating?: number | null
          rating_note?: string | null
          region?: string | null
          request_id?: string | null
          review_status?: string | null
          share_slug?: string
          summary: string
          user_id?: string | null
          verdict: Database["public"]["Enums"]["verdict"]
          visitor_id?: string | null
        }
        Update: {
          case_number?: string
          company_id?: string | null
          confidence?: number
          created_at?: string
          details?: Json
          feedback?: Database["public"]["Enums"]["scan_feedback"] | null
          feedback_at?: string | null
          file_name?: string | null
          id?: string
          image_bytes?: number | null
          image_deleted_at?: string | null
          image_mime?: string | null
          image_path?: string | null
          image_sha256?: string | null
          ip_hash?: string | null
          is_public?: boolean
          latency_ms?: number | null
          model?: string
          policy_clause?: string | null
          rating?: number | null
          rating_note?: string | null
          region?: string | null
          request_id?: string | null
          review_status?: string | null
          share_slug?: string
          summary?: string
          user_id?: string | null
          verdict?: Database["public"]["Enums"]["verdict"]
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      generate_certificate_code: { Args: never; Returns: string }
      get_company_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          certified_hot_dogs: number
          company_id: string
          hot_dog_share: number
          last_activity: string
          name: string
          rated_hot_dogs: number
          score: number
          slug: string
          total_scans: number
        }[]
      }
      get_global_stats: {
        Args: never
        Returns: {
          feedback_correct: number
          feedback_incorrect: number
          hot_dog_scans: number
          hot_dog_scans_today: number
          not_hot_dog_scans: number
          p50_latency_ms: number
          scans_last_24h: number
          scans_today: number
          total_scans: number
        }[]
      }
      record_certificate_verification: {
        Args: { p_code: string }
        Returns: {
          code: string
          created_at: string
          id: string
          issued_to: string
          last_verified_at: string | null
          number: string
          product_name: string | null
          revoked_at: string | null
          revoked_reason: string | null
          scan_id: string
          sku: string | null
          status: string
          verification_count: number
        }[]
        SetofOptions: {
          from: "*"
          to: "certificates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      scan_feedback: "correct" | "incorrect"
      verdict: "hot_dog" | "not_hot_dog"
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
    Enums: {
      scan_feedback: ["correct", "incorrect"],
      verdict: ["hot_dog", "not_hot_dog"],
    },
  },
} as const
