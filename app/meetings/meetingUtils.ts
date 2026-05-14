/** FY starts 1 April — months Jan–Mar belong to previous FY label. */
export function getFinancialYear(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  const month = d.getMonth();
  const year = d.getFullYear();
  const startYear = month < 3 ? year - 1 : year;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function fetchFinancialYears(): Promise<Array<{ id: string; label: string; startDate: string; endDate: string }>> {
  try {
    console.log("Fetching financial years from /api/v1/financial-years");
    const response = await fetch("/hudd-dashboard/api/v1/financial-years", { cache: "no-store" });
    console.log("Response status:", response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch financial years: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log("Received data:", data);
    
    const items = data.items || [];
    console.log("Financial years items:", items);
    
    return items;
  } catch (error) {
    console.error("Error fetching financial years:", error);
    return [];
  }
}
