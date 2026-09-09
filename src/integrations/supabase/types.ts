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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          couple_id: string | null
          description: string | null
          earned_at: string
          icon: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          couple_id?: string | null
          description?: string | null
          earned_at?: string
          icon?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          couple_id?: string | null
          description?: string | null
          earned_at?: string
          icon?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          balance: number | null
          color: string | null
          connection_id: string | null
          couple_id: string | null
          created_at: string
          currency: string | null
          hidden: boolean
          icon: string | null
          id: string
          name: string | null
          pluggy_account_id: string | null
          source: string
          subtype: string | null
          type: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          account_number?: string | null
          balance?: number | null
          color?: string | null
          connection_id?: string | null
          couple_id?: string | null
          created_at?: string
          currency?: string | null
          hidden?: boolean
          icon?: string | null
          id?: string
          name?: string | null
          pluggy_account_id?: string | null
          source?: string
          subtype?: string | null
          type?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          account_number?: string | null
          balance?: number | null
          color?: string | null
          connection_id?: string | null
          couple_id?: string | null
          created_at?: string
          currency?: string | null
          hidden?: boolean
          icon?: string | null
          id?: string
          name?: string | null
          pluggy_account_id?: string | null
          source?: string
          subtype?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          couple_id: string | null
          created_at: string
          id: string
          institution_id: string | null
          institution_logo: string | null
          institution_name: string | null
          last_synced_at: string | null
          metadata: Json | null
          pluggy_item_id: string | null
          provider: string
          status: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          id?: string
          institution_id?: string | null
          institution_logo?: string | null
          institution_name?: string | null
          last_synced_at?: string | null
          metadata?: Json | null
          pluggy_item_id?: string | null
          provider: string
          status?: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          id?: string
          institution_id?: string | null
          institution_logo?: string | null
          institution_name?: string | null
          last_synced_at?: string | null
          metadata?: Json | null
          pluggy_item_id?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          account_id: string
          amount: number
          category: string | null
          couple_id: string | null
          created_at: string
          currency: string | null
          date: string
          description: string | null
          id: string
          imported_tx_id: string | null
          pluggy_category: string | null
          pluggy_transaction_id: string
          type: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          account_id: string
          amount: number
          category?: string | null
          couple_id?: string | null
          created_at?: string
          currency?: string | null
          date: string
          description?: string | null
          id?: string
          imported_tx_id?: string | null
          pluggy_category?: string | null
          pluggy_transaction_id: string
          type?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          account_id?: string
          amount?: number
          category?: string | null
          couple_id?: string | null
          created_at?: string
          currency?: string | null
          date?: string
          description?: string | null
          id?: string
          imported_tx_id?: string | null
          pluggy_category?: string | null
          pluggy_transaction_id?: string
          type?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_imported_tx_id_fkey"
            columns: ["imported_tx_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      card_invoice_edits: {
        Row: {
          created_at: string
          edited_by: string
          field: string
          id: string
          invoice_id: string
          new_value: string | null
          note: string | null
          old_value: string | null
        }
        Insert: {
          created_at?: string
          edited_by: string
          field: string
          id?: string
          invoice_id: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
        }
        Update: {
          created_at?: string
          edited_by?: string
          field?: string
          id?: string
          invoice_id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_invoice_edits_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "card_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      card_invoices: {
        Row: {
          card_id: string
          closing_date: string
          couple_id: string | null
          created_at: string
          due_date: string
          id: string
          manual_adjustment: number
          notes: string | null
          paid_amount: number
          paid_at: string | null
          payment_transaction_id: string | null
          reference_month: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          card_id: string
          closing_date: string
          couple_id?: string | null
          created_at?: string
          due_date: string
          id?: string
          manual_adjustment?: number
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_transaction_id?: string | null
          reference_month: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          card_id?: string
          closing_date?: string
          couple_id?: string | null
          created_at?: string
          due_date?: string
          id?: string
          manual_adjustment?: number
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_transaction_id?: string | null
          reference_month?: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_invoices_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_invoices_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_invoices_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          couple_id: string | null
          created_at: string
          icon: string
          id: string
          is_archived: boolean
          name: string
          parent_id: string | null
          sort_order: number
          type: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          color?: string
          couple_id?: string | null
          created_at?: string
          icon?: string
          id?: string
          is_archived?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          type: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          color?: string
          couple_id?: string | null
          created_at?: string
          icon?: string
          id?: string
          is_archived?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          type?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_progress: {
        Row: {
          challenge_id: string
          created_at: string
          date: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          couple_id: string | null
          created_at: string
          end_date: string | null
          id: string
          name: string
          objective: string | null
          reward: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          objective?: string | null
          reward?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          objective?: string | null
          reward?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invite_code: string
          name: string | null
          photo_url: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invite_code?: string
          name?: string | null
          photo_url?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invite_code?: string
          name?: string | null
          photo_url?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      credit_cards: {
        Row: {
          bank: string | null
          closing_day: number
          color: string
          couple_id: string | null
          created_at: string
          due_day: number
          id: string
          limit_amount: number
          name: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          bank?: string | null
          closing_day?: number
          color?: string
          couple_id?: string | null
          created_at?: string
          due_day?: number
          id?: string
          limit_amount?: number
          name: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          bank?: string | null
          closing_day?: number
          color?: string
          couple_id?: string | null
          created_at?: string
          due_day?: number
          id?: string
          limit_amount?: number
          name?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          config: Json | null
          created_at: string
          enabled: boolean
          id: string
          position: number
          user_id: string
          widget_key: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          position?: number
          user_id: string
          widget_key: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          position?: number
          user_id?: string
          widget_key?: string
        }
        Relationships: []
      }
      dates: {
        Row: {
          couple_id: string | null
          cover_photo: string | null
          created_at: string
          date_at: string | null
          id: string
          location: string | null
          notes: string | null
          planned_amount: number | null
          status: string
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          couple_id?: string | null
          cover_photo?: string | null
          created_at?: string
          date_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          planned_amount?: number | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          couple_id?: string | null
          cover_photo?: string | null
          created_at?: string
          date_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          planned_amount?: number | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "dates_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: string | null
          color: string | null
          couple_id: string | null
          created_at: string
          description: string | null
          end_date: string | null
          end_time: string | null
          event_date: string
          event_time: string | null
          id: string
          location: string | null
          recurrence: string
          responsible_user_id: string | null
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          couple_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          location?: string | null
          recurrence?: string
          responsible_user_id?: string | null
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          category?: string | null
          color?: string | null
          couple_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          location?: string | null
          recurrence?: string
          responsible_user_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_simulations: {
        Row: {
          amount: number
          card_id: string | null
          category: string | null
          converted_expense_id: string | null
          couple_id: string | null
          created_at: string
          decision_at: string | null
          decision_by: string | null
          decision_status: string | null
          final_amount: number | null
          first_payment_date: string | null
          id: string
          installments: number
          interest_enabled: boolean
          interest_rate: number | null
          metadata: Json | null
          partner_comment: string | null
          payment_method: string
          purchase_date: string
          risk_level: string | null
          simulation_result: Json | null
          status: string
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          amount: number
          card_id?: string | null
          category?: string | null
          converted_expense_id?: string | null
          couple_id?: string | null
          created_at?: string
          decision_at?: string | null
          decision_by?: string | null
          decision_status?: string | null
          final_amount?: number | null
          first_payment_date?: string | null
          id?: string
          installments?: number
          interest_enabled?: boolean
          interest_rate?: number | null
          metadata?: Json | null
          partner_comment?: string | null
          payment_method: string
          purchase_date?: string
          risk_level?: string | null
          simulation_result?: Json | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          amount?: number
          card_id?: string | null
          category?: string | null
          converted_expense_id?: string | null
          couple_id?: string | null
          created_at?: string
          decision_at?: string | null
          decision_by?: string | null
          decision_status?: string | null
          final_amount?: number | null
          first_payment_date?: string | null
          id?: string
          installments?: number
          interest_enabled?: boolean
          interest_rate?: number | null
          metadata?: Json | null
          partner_comment?: string | null
          payment_method?: string
          purchase_date?: string
          risk_level?: string | null
          simulation_result?: Json | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      financial_institutions: {
        Row: {
          country: string | null
          created_at: string
          external_id: string | null
          id: string
          image_url: string | null
          name: string
          official_name: string | null
          pluggy_institution_id: string | null
          primary_color: string | null
          provider: string
          status: string | null
          supports_checking: boolean | null
          supports_credit_card: boolean | null
          supports_investments: boolean | null
          supports_loans: boolean | null
          supports_open_finance: boolean | null
          type: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          image_url?: string | null
          name: string
          official_name?: string | null
          pluggy_institution_id?: string | null
          primary_color?: string | null
          provider?: string
          status?: string | null
          supports_checking?: boolean | null
          supports_credit_card?: boolean | null
          supports_investments?: boolean | null
          supports_loans?: boolean | null
          supports_open_finance?: boolean | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          image_url?: string | null
          name?: string
          official_name?: string | null
          pluggy_institution_id?: string | null
          primary_color?: string | null
          provider?: string
          status?: string | null
          supports_checking?: boolean | null
          supports_credit_card?: boolean | null
          supports_investments?: boolean | null
          supports_loans?: boolean | null
          supports_open_finance?: boolean | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      future_bills: {
        Row: {
          amount: number
          category: string | null
          couple_id: string | null
          created_at: string
          due_date: string
          id: string
          notes: string | null
          paid: boolean
          recurrence: string
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          amount?: number
          category?: string | null
          couple_id?: string | null
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          paid?: boolean
          recurrence?: string
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          amount?: number
          category?: string | null
          couple_id?: string | null
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid?: boolean
          recurrence?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "future_bills_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_contributions: {
        Row: {
          amount: number
          created_at: string
          date: string
          goal_id: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          goal_id: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          goal_id?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "dashboard_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          couple_id: string | null
          created_at: string
          current_amount: number
          deadline: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          status: string
          target_amount: number
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          current_amount?: number
          deadline?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          status?: string
          target_amount?: number
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          current_amount?: number
          deadline?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          status?: string
          target_amount?: number
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_logs: {
        Row: {
          couple_id: string | null
          created_at: string
          date: string
          habit_id: string
          id: string
          note: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          date?: string
          habit_id: string
          id?: string
          note?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          date?: string
          habit_id?: string
          id?: string
          note?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          active: boolean | null
          color: string | null
          couple_id: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          period: string | null
          scope: string | null
          target_per_week: number | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          couple_id?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          period?: string | null
          scope?: string | null
          target_per_week?: number | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          active?: boolean | null
          color?: string | null
          couple_id?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          period?: string | null
          scope?: string | null
          target_per_week?: number | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "habits_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      health_meals: {
        Row: {
          calories: number | null
          couple_id: string | null
          created_at: string
          date: string
          description: string
          id: string
          meal_type: string
          notes: string | null
          photo_path: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          calories?: number | null
          couple_id?: string | null
          created_at?: string
          date?: string
          description: string
          id?: string
          meal_type: string
          notes?: string | null
          photo_path?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          calories?: number | null
          couple_id?: string | null
          created_at?: string
          date?: string
          description?: string
          id?: string
          meal_type?: string
          notes?: string | null
          photo_path?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_meals_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      health_metrics: {
        Row: {
          couple_id: string | null
          created_at: string
          date: string
          height: number | null
          id: string
          notes: string | null
          target_weight: number | null
          user_id: string
          visibility: string
          weight: number | null
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          date?: string
          height?: number | null
          id?: string
          notes?: string | null
          target_weight?: number | null
          user_id: string
          visibility?: string
          weight?: number | null
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          date?: string
          height?: number | null
          id?: string
          notes?: string | null
          target_weight?: number | null
          user_id?: string
          visibility?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "health_metrics_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      house_task_categories: {
        Row: {
          color: string
          couple_id: string | null
          created_at: string
          icon: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          couple_id?: string | null
          created_at?: string
          icon?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          couple_id?: string | null
          created_at?: string
          icon?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_task_categories_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      house_task_history: {
        Row: {
          completed_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "house_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      house_tasks: {
        Row: {
          category_id: string | null
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          couple_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          frequency: string
          id: string
          name: string
          priority: string
          responsible: string
          responsible_user_id: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          category_id?: string | null
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          couple_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          frequency?: string
          id?: string
          name: string
          priority?: string
          responsible?: string
          responsible_user_id?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          category_id?: string | null
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          couple_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          frequency?: string
          id?: string
          name?: string
          priority?: string
          responsible?: string
          responsible_user_id?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "house_task_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_tasks_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      household_need_attachments: {
        Row: {
          created_at: string
          file_name: string | null
          file_type: string | null
          file_url: string
          household_need_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url: string
          household_need_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string
          household_need_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_need_attachments_household_need_id_fkey"
            columns: ["household_need_id"]
            isOneToOne: false
            referencedRelation: "household_needs"
            referencedColumns: ["id"]
          },
        ]
      }
      household_needs: {
        Row: {
          actual_amount: number | null
          assigned_to: string | null
          category: string | null
          completed_at: string | null
          couple_id: string | null
          created_at: string
          created_by: string
          description: string | null
          estimated_amount: number | null
          expense_id: string | null
          id: string
          item_type: string
          metadata: Json
          planned_date: string | null
          planned_installments: number | null
          planned_month: string | null
          planned_payment_method: string | null
          priority: string
          simulation_id: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          actual_amount?: number | null
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          couple_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          estimated_amount?: number | null
          expense_id?: string | null
          id?: string
          item_type?: string
          metadata?: Json
          planned_date?: string | null
          planned_installments?: number | null
          planned_month?: string | null
          planned_payment_method?: string | null
          priority?: string
          simulation_id?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          actual_amount?: number | null
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          couple_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          estimated_amount?: number | null
          expense_id?: string | null
          id?: string
          item_type?: string
          metadata?: Json
          planned_date?: string | null
          planned_installments?: number | null
          planned_month?: string | null
          planned_payment_method?: string | null
          priority?: string
          simulation_id?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      installments: {
        Row: {
          amount: number
          couple_id: string | null
          created_at: string
          due_date: string
          id: string
          installment_number: number
          paid: boolean
          paid_at: string | null
          total_installments: number
          transaction_id: string
          user_id: string
          visibility: string
        }
        Insert: {
          amount: number
          couple_id?: string | null
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          paid?: boolean
          paid_at?: string | null
          total_installments: number
          transaction_id: string
          user_id: string
          visibility?: string
        }
        Update: {
          amount?: number
          couple_id?: string | null
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          paid?: boolean
          paid_at?: string | null
          total_installments?: number
          transaction_id?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          couple_id: string | null
          created_at: string
          day_of_week: number
          favorite: boolean
          id: string
          meal_type: string
          notes: string | null
          recipe_id: string | null
          servings: number | null
          title: string
          user_id: string
          visibility: string
          week_start: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          day_of_week: number
          favorite?: boolean
          id?: string
          meal_type: string
          notes?: string | null
          recipe_id?: string | null
          servings?: number | null
          title: string
          user_id: string
          visibility?: string
          week_start: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          day_of_week?: number
          favorite?: boolean
          id?: string
          meal_type?: string
          notes?: string | null
          recipe_id?: string | null
          servings?: number | null
          title?: string
          user_id?: string
          visibility?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          album_id: string | null
          couple_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          location: string | null
          memory_date: string | null
          photo_path: string | null
          title: string
          user_id: string
          visibility: string
        }
        Insert: {
          album_id?: string | null
          couple_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          memory_date?: string | null
          photo_path?: string | null
          title: string
          user_id: string
          visibility?: string
        }
        Update: {
          album_id?: string | null
          couple_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          memory_date?: string | null
          photo_path?: string | null
          title?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "memory_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_albums: {
        Row: {
          couple_id: string | null
          cover: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          couple_id?: string | null
          cover?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          couple_id?: string | null
          cover?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_albums_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_budget_allocations: {
        Row: {
          category_id: string
          created_at: string
          id: string
          plan_id: string
          planned_amount: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          plan_id: string
          planned_amount?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          plan_id?: string
          planned_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_budget_allocations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_budget_allocations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "monthly_financial_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_financial_plans: {
        Row: {
          couple_id: string | null
          created_at: string
          created_by: string
          distribute_all: boolean
          edit_policy: string
          expected_income: number
          id: string
          notes: string | null
          planned_goals: number
          planned_reserve: number
          reference_month: string
          spending_limit: number
          status: string
          suggested_percentage: number
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          created_by: string
          distribute_all?: boolean
          edit_policy?: string
          expected_income?: number
          id?: string
          notes?: string | null
          planned_goals?: number
          planned_reserve?: number
          reference_month: string
          spending_limit?: number
          status?: string
          suggested_percentage?: number
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          created_by?: string
          distribute_all?: boolean
          edit_policy?: string
          expected_income?: number
          id?: string
          notes?: string | null
          planned_goals?: number
          planned_reserve?: number
          reference_month?: string
          spending_limit?: number
          status?: string
          suggested_percentage?: number
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_financial_plans_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_plan_history: {
        Row: {
          action: string
          changed_by: string
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          plan_id: string
        }
        Insert: {
          action: string
          changed_by: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          plan_id: string
        }
        Update: {
          action?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_plan_history_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "monthly_financial_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          link: string | null
          read: boolean
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          read?: boolean
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      period_goals: {
        Row: {
          couple_id: string | null
          created_at: string
          description: string | null
          id: string
          period_start: string
          period_type: string
          priority: string | null
          scope: string | null
          status: string | null
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          period_start: string
          period_type: string
          priority?: string | null
          scope?: string | null
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          period_start?: string
          period_type?: string
          priority?: string | null
          scope?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_goals_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          caption: string | null
          couple_id: string | null
          created_at: string
          id: string
          url: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          couple_id?: string | null
          created_at?: string
          id?: string
          url: string
          user_id: string
        }
        Update: {
          caption?: string | null
          couple_id?: string | null
          created_at?: string
          id?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          couple_id: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          couple_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          couple_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          couple_id: string | null
          created_at: string
          description: string | null
          favorite: boolean | null
          id: string
          image_url: string | null
          ingredients: Json
          instructions: string | null
          name: string
          prep_minutes: number | null
          servings: number | null
          tags: string[] | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          description?: string | null
          favorite?: boolean | null
          id?: string
          image_url?: string | null
          ingredients?: Json
          instructions?: string | null
          name: string
          prep_minutes?: number | null
          servings?: number | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          description?: string | null
          favorite?: boolean | null
          id?: string
          image_url?: string | null
          ingredients?: Json
          instructions?: string | null
          name?: string
          prep_minutes?: number | null
          servings?: number | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_completions: {
        Row: {
          couple_id: string | null
          created_at: string
          date: string
          id: string
          routine_item_id: string
          user_id: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          date?: string
          id?: string
          routine_item_id: string
          user_id: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          date?: string
          id?: string
          routine_item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_completions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_completions_routine_item_id_fkey"
            columns: ["routine_item_id"]
            isOneToOne: false
            referencedRelation: "routine_items"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_items: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number | null
          routine_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number | null
          routine_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number | null
          routine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_items_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          active: boolean | null
          couple_id: string | null
          created_at: string
          id: string
          period: string
          position: number | null
          scope: string | null
          title: string
          updated_at: string
          user_id: string
          visibility: string
          weekdays: number[] | null
        }
        Insert: {
          active?: boolean | null
          couple_id?: string | null
          created_at?: string
          id?: string
          period?: string
          position?: number | null
          scope?: string | null
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
          weekdays?: number[] | null
        }
        Update: {
          active?: boolean | null
          couple_id?: string | null
          created_at?: string
          id?: string
          period?: string
          position?: number | null
          scope?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "routines_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          currency: string
          language: string
          notify_agenda: boolean
          notify_challenges: boolean
          notify_finance: boolean
          notify_goals: boolean
          notify_tasks: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          currency?: string
          language?: string
          notify_agenda?: boolean
          notify_challenges?: boolean
          notify_finance?: boolean
          notify_goals?: boolean
          notify_tasks?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          currency?: string
          language?: string
          notify_agenda?: boolean
          notify_challenges?: boolean
          notify_finance?: boolean
          notify_goals?: boolean
          notify_tasks?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shopping_items: {
        Row: {
          category: string
          checked: boolean
          couple_id: string | null
          created_at: string
          id: string
          meal_plan_id: string | null
          name: string
          quantity: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          category?: string
          checked?: boolean
          couple_id?: string | null
          created_at?: string
          id?: string
          meal_plan_id?: string | null
          name: string
          quantity?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          category?: string
          checked?: boolean
          couple_id?: string | null
          created_at?: string
          id?: string
          meal_plan_id?: string | null
          name?: string
          quantity?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_items_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          subscription_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          subscription_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_id: string | null
          amount: number
          amount_after_trial: number | null
          auto_renew: boolean
          billing_day: number | null
          billing_frequency: string
          billing_interval: number
          card_id: string | null
          category_id: string | null
          couple_id: string | null
          created_at: string
          created_by: string
          currency: string
          description: string | null
          end_date: string | null
          icon: string | null
          id: string
          last_charged_at: string | null
          last_generated_transaction_id: string | null
          metadata: Json
          name: string
          next_billing_date: string
          payment_method: string
          renewal_date: string | null
          responsible_user_id: string | null
          start_date: string | null
          status: string
          trial_enabled: boolean
          trial_end_date: string | null
          updated_at: string
          url: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          amount_after_trial?: number | null
          auto_renew?: boolean
          billing_day?: number | null
          billing_frequency?: string
          billing_interval?: number
          card_id?: string | null
          category_id?: string | null
          couple_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          last_charged_at?: string | null
          last_generated_transaction_id?: string | null
          metadata?: Json
          name: string
          next_billing_date?: string
          payment_method?: string
          renewal_date?: string | null
          responsible_user_id?: string | null
          start_date?: string | null
          status?: string
          trial_enabled?: boolean
          trial_end_date?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          amount_after_trial?: number | null
          auto_renew?: boolean
          billing_day?: number | null
          billing_frequency?: string
          billing_interval?: number
          card_id?: string | null
          category_id?: string | null
          couple_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          last_charged_at?: string | null
          last_generated_transaction_id?: string | null
          metadata?: Json
          name?: string
          next_billing_date?: string
          payment_method?: string
          renewal_date?: string | null
          responsible_user_id?: string | null
          start_date?: string | null
          status?: string
          trial_enabled?: boolean
          trial_end_date?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_last_generated_transaction_id_fkey"
            columns: ["last_generated_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      synced_cards: {
        Row: {
          account_id: string | null
          available_limit: number | null
          card_brand: string | null
          card_last_digits: string | null
          card_name: string | null
          closing_day: number | null
          connection_id: string
          couple_id: string | null
          created_at: string
          current_bill: number | null
          due_day: number | null
          id: string
          limit_amount: number | null
          pluggy_card_id: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          account_id?: string | null
          available_limit?: number | null
          card_brand?: string | null
          card_last_digits?: string | null
          card_name?: string | null
          closing_day?: number | null
          connection_id: string
          couple_id?: string | null
          created_at?: string
          current_bill?: number | null
          due_day?: number | null
          id?: string
          limit_amount?: number | null
          pluggy_card_id: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          account_id?: string | null
          available_limit?: number | null
          card_brand?: string | null
          card_last_digits?: string | null
          card_name?: string | null
          closing_day?: number | null
          connection_id?: string
          couple_id?: string | null
          created_at?: string
          current_bill?: number | null
          due_day?: number | null
          id?: string
          limit_amount?: number | null
          pluggy_card_id?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "synced_cards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "synced_cards_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          attachment_url: string | null
          category_id: string | null
          couple_id: string | null
          created_at: string
          credit_card_id: string | null
          date: string
          description: string | null
          id: string
          imported_from: string | null
          is_card_payment: boolean
          note: string | null
          pluggy_transaction_id: string | null
          responsible_user_id: string | null
          source: string | null
          total_installments: number | null
          type: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          attachment_url?: string | null
          category_id?: string | null
          couple_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          date?: string
          description?: string | null
          id?: string
          imported_from?: string | null
          is_card_payment?: boolean
          note?: string | null
          pluggy_transaction_id?: string | null
          responsible_user_id?: string | null
          source?: string | null
          total_installments?: number | null
          type: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          attachment_url?: string | null
          category_id?: string | null
          couple_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          date?: string
          description?: string | null
          id?: string
          imported_from?: string | null
          is_card_payment?: boolean
          note?: string | null
          pluggy_transaction_id?: string | null
          responsible_user_id?: string | null
          source?: string | null
          total_installments?: number | null
          type?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      user_points: {
        Row: {
          couple_id: string | null
          created_at: string
          id: string
          points: number
          reason: string
          ref_id: string | null
          ref_table: string | null
          user_id: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          id?: string
          points?: number
          reason: string
          ref_id?: string | null
          ref_table?: string | null
          user_id: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          id?: string
          points?: number
          reason?: string
          ref_id?: string | null
          ref_table?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_points_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      water_intake: {
        Row: {
          couple_id: string | null
          created_at: string
          date: string
          id: string
          ml: number
          user_id: string
          visibility: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          date?: string
          id?: string
          ml?: number
          user_id: string
          visibility?: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          date?: string
          id?: string
          ml?: number
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "water_intake_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_records: {
        Row: {
          couple_id: string | null
          created_at: string
          id: string
          parsed: Json | null
          raw_text: string
          status: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          id?: string
          parsed?: Json | null
          raw_text: string
          status?: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          id?: string
          parsed?: Json | null
          raw_text?: string
          status?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_records_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_records_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      wishes: {
        Row: {
          achieved: boolean
          couple_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          title: string
          type: string
          user_id: string
          visibility: string
        }
        Insert: {
          achieved?: boolean
          couple_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          title: string
          type?: string
          user_id: string
          visibility?: string
        }
        Update: {
          achieved?: boolean
          couple_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          title?: string
          type?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishes_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          calories: number | null
          couple_id: string | null
          created_at: string
          date: string
          duration_min: number
          id: string
          notes: string | null
          type: string
          user_id: string
          visibility: string
        }
        Insert: {
          calories?: number | null
          couple_id?: string | null
          created_at?: string
          date?: string
          duration_min?: number
          id?: string
          notes?: string | null
          type: string
          user_id: string
          visibility?: string
        }
        Update: {
          calories?: number | null
          couple_id?: string | null
          created_at?: string
          date?: string
          duration_min?: number
          id?: string
          notes?: string | null
          type?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dashboard_finance: {
        Row: {
          balance: number | null
          couple_id: string | null
          expense: number | null
          income: number | null
          month: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_goals: {
        Row: {
          couple_id: string | null
          current_amount: number | null
          deadline: string | null
          id: string | null
          name: string | null
          progress_pct: number | null
          status: string | null
          target_amount: number | null
        }
        Insert: {
          couple_id?: string | null
          current_amount?: number | null
          deadline?: string | null
          id?: string | null
          name?: string | null
          progress_pct?: never
          status?: string | null
          target_amount?: number | null
        }
        Update: {
          couple_id?: string | null
          current_amount?: number | null
          deadline?: string | null
          id?: string | null
          name?: string | null
          progress_pct?: never
          status?: string | null
          target_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_tasks: {
        Row: {
          couple_id: string | null
          done: number | null
          late: number | null
          pending: number | null
        }
        Relationships: [
          {
            foreignKeyName: "house_tasks_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      award_points: {
        Args: {
          _couple_id: string
          _points: number
          _reason: string
          _ref_id: string
          _ref_table: string
          _user_id: string
        }
        Returns: undefined
      }
      can_access_plan: { Args: { _plan_id: string }; Returns: boolean }
      can_edit_plan: { Args: { _plan_id: string }; Returns: boolean }
      current_couple_id: { Args: never; Returns: string }
      edit_card_invoice: {
        Args: {
          _invoice_id: string
          _new_due_date: string
          _new_manual_adjustment: number
          _new_reference_month: string
          _note?: string
        }
        Returns: {
          card_id: string
          closing_date: string
          couple_id: string | null
          created_at: string
          due_date: string
          id: string
          manual_adjustment: number
          notes: string | null
          paid_amount: number
          paid_at: string | null
          payment_transaction_id: string | null
          reference_month: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "card_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_card_invoice: {
        Args: { p_card_id: string; p_reference_month: string }
        Returns: {
          card_id: string
          closing_date: string
          couple_id: string | null
          created_at: string
          due_date: string
          id: string
          manual_adjustment: number
          notes: string | null
          paid_amount: number
          paid_at: string | null
          payment_transaction_id: string | null
          reference_month: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "card_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_couple_member: { Args: { _couple_id: string }; Returns: boolean }
      join_couple_by_code: { Args: { _code: string }; Returns: string }
      mark_card_invoice_paid: {
        Args: {
          _account_id?: string
          _invoice_id: string
          _payment_amount: number
          _payment_date?: string
        }
        Returns: string
      }
      process_subscription_charges: {
        Args: never
        Returns: {
          status: string
          subscription_id: string
          transaction_id: string
        }[]
      }
      recalculate_card_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      reset_credit_cards_data: {
        Args: never
        Returns: {
          deleted_cards: number
          deleted_transactions: number
        }[]
      }
      resolve_card_invoice_cycle: {
        Args: {
          _closing_day: number
          _due_day: number
          _installment_number?: number
          _purchase_date: string
        }
        Returns: {
          closing_date: string
          due_date: string
          reference_month: string
        }[]
      }
      set_invoice_manual_adjustment: {
        Args: { _adjustment: number; _invoice_id: string }
        Returns: {
          card_id: string
          closing_date: string
          couple_id: string | null
          created_at: string
          due_date: string
          id: string
          manual_adjustment: number
          notes: string | null
          paid_amount: number
          paid_at: string | null
          payment_transaction_id: string | null
          reference_month: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "card_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      undo_card_invoice_payment: {
        Args: { _invoice_id: string; _payment_transaction_id?: string }
        Returns: undefined
      }
      update_my_invoice_statuses: { Args: never; Returns: undefined }
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
