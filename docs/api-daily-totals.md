# Daily Totals API Documentation

## Overview

The Daily Totals API provides endpoints to retrieve aggregated work time data across all user trackers for visualization and analytics purposes.

## Endpoints

### 1. Get Daily Totals by Period

**Endpoint:** `GET /users/:userId/daily-totals/:period`

**Description:** Retrieves daily work totals for predefined time periods (week, month, year).

**Parameters:**

- `userId` (path parameter): User's unique identifier
- `period` (path parameter): Time period - one of: `week`, `month`, `year`

**Period Definitions:**

- `week`: Last 7 days (including today)
- `month`: Last 30 days (including today)
- `year`: Last 365 days (including today)

**Response Format:**

```json
{
  "success": true,
  "data": [
    {
      "date": "2025-09-04",
      "totalMinutes": 480,
      "totalHours": 8.0,
      "sessionCount": 3
    },
    {
      "date": "2025-09-05",
      "totalMinutes": 0,
      "totalHours": 0.0,
      "sessionCount": 0
    }
  ]
}
```

**Error Response:**

```json
{
  "success": false,
  "error": "Period must be one of: week, month, year"
}
```

### 2. Get Daily Totals by Custom Date Range

**Endpoint:** `GET /users/:userId/daily-totals?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

**Description:** Retrieves daily work totals for a custom date range.

**Parameters:**

- `userId` (path parameter): User's unique identifier
- `startDate` (query parameter): Start date in YYYY-MM-DD format
- `endDate` (query parameter): End date in YYYY-MM-DD format

**Example:** `GET /users/user123/daily-totals?startDate=2025-09-01&endDate=2025-09-07`

## Next.js Integration Examples

### 1. Custom Hook for Daily Totals

```typescript
// hooks/useDailyTotals.ts
import { useState, useEffect } from "react";

interface DailyTotal {
  date: string;
  totalMinutes: number;
  totalHours: number;
  sessionCount: number;
}

interface DailyTotalsResponse {
  success: boolean;
  data: DailyTotal[];
  error?: string;
}

export const useDailyTotals = (
  userId: string,
  period: "week" | "month" | "year"
) => {
  const [data, setData] = useState<DailyTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDailyTotals = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/users/${userId}/daily-totals/${period}`
        );
        const result: DailyTotalsResponse = await response.json();

        if (result.success) {
          setData(result.data);
          setError(null);
        } else {
          setError(result.error || "Failed to fetch daily totals");
        }
      } catch (err) {
        setError("Network error occurred");
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchDailyTotals();
    }
  }, [userId, period]);

  return { data, loading, error };
};
```

### 2. API Route Handler (Next.js App Router)

```typescript
// app/api/users/[userId]/daily-totals/[period]/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.BACKEND_API_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string; period: string } }
) {
  try {
    const { userId, period } = params;

    // Validate period
    if (!["week", "month", "year"].includes(period)) {
      return NextResponse.json(
        { success: false, error: "Invalid period" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${API_BASE_URL}/users/${userId}/daily-totals/${period}`,
      {
        headers: {
          "Content-Type": "application/json",
          // Add authentication headers if needed
          // 'Authorization': `Bearer ${token}`
        },
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 3. React Component with Chart Integration

```typescript
// components/DailyTotalsChart.tsx
"use client";

import { useDailyTotals } from "@/hooks/useDailyTotals";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  userId: string;
  period: "week" | "month" | "year";
}

export default function DailyTotalsChart({ userId, period }: Props) {
  const { data, loading, error } = useDailyTotals(userId, period);

  if (loading) return <div>Loading chart...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="w-full h-96">
      <h3 className="text-lg font-semibold mb-4">
        Daily Work Hours - {period.charAt(0).toUpperCase() + period.slice(1)}
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => new Date(date).toLocaleDateString()}
          />
          <YAxis
            label={{ value: "Hours", angle: -90, position: "insideLeft" }}
          />
          <Tooltip
            labelFormatter={(date) => new Date(date).toLocaleDateString()}
            formatter={(value, name) => [
              `${value} hours`,
              name === "totalHours" ? "Work Hours" : name,
            ]}
          />
          <Line
            type="monotone"
            dataKey="totalHours"
            stroke="#8884d8"
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### 4. Period Selector Component

```typescript
// components/PeriodSelector.tsx
"use client";

import { useState } from "react";

interface Props {
  onPeriodChange: (period: "week" | "month" | "year") => void;
  defaultPeriod?: "week" | "month" | "year";
}

export default function PeriodSelector({
  onPeriodChange,
  defaultPeriod = "week",
}: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);

  const periods = [
    { value: "week", label: "Last 7 Days" },
    { value: "month", label: "Last 30 Days" },
    { value: "year", label: "Last Year" },
  ] as const;

  const handlePeriodChange = (period: "week" | "month" | "year") => {
    setSelectedPeriod(period);
    onPeriodChange(period);
  };

  return (
    <div className="flex space-x-2 mb-4">
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => handlePeriodChange(period.value)}
          className={`px-4 py-2 rounded-md transition-colors ${
            selectedPeriod === period.value
              ? "bg-blue-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
```

### 5. Complete Dashboard Page Example

```typescript
// app/dashboard/analytics/page.tsx
"use client";

import { useState } from "react";
import { useUser } from "@/hooks/useUser"; // Assume you have user context
import DailyTotalsChart from "@/components/DailyTotalsChart";
import PeriodSelector from "@/components/PeriodSelector";

export default function AnalyticsPage() {
  const { user } = useUser();
  const [selectedPeriod, setSelectedPeriod] = useState<
    "week" | "month" | "year"
  >("week");

  if (!user) return <div>Please log in to view analytics</div>;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Work Analytics</h1>

      <div className="bg-white rounded-lg shadow-md p-6">
        <PeriodSelector
          onPeriodChange={setSelectedPeriod}
          defaultPeriod={selectedPeriod}
        />

        <DailyTotalsChart userId={user.userId} period={selectedPeriod} />
      </div>
    </div>
  );
}
```

## Environment Variables

Add to your `.env.local`:

```bash
BACKEND_API_URL=http://localhost:3001
```

## Dependencies

Install required packages:

```bash
npm install recharts
# or
yarn add recharts
```

## Notes

- All dates are returned in ISO format (YYYY-MM-DD)
- Data includes every day in the range, with 0 values for days without work
- Times are aggregated across all user's trackers
- The API returns both minutes and hours for flexibility in display
- Session count can be used for additional insights (productivity patterns)
