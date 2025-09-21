"use server";

import endpoints from "@/lib/api/endpoints";

export interface IBrandApplicationsParams {
  page?: number;
  limit?: number;
}

export async function getBrandApplicationsRoute(
  brandId: string,
  params: IBrandApplicationsParams,
  token: string,
) {
  try {
    // Construct the endpoint URL
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.append('page', params.page.toString());
    if (params.limit) searchParams.append('limit', params.limit.toString());
    
    const queryString = searchParams.toString();
    const url = `${endpoints.server_url}/api/${brandId}/campaigns/applications${queryString ? `?${queryString}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    // Handle API errors and non-JSON responses
    if (!response.ok) {
      const contentType = response.headers.get("Content-Type");
      if (contentType && contentType.includes("application/json")) {
        const errorData = await response.json();
        throw new Error(errorData.message || response.statusText);
      } else {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }
    }

    return { status: "success", data: await response.json() };
  } catch (error) {
    console.error("Error in getBrandApplicationsRoute:", error.message);
    return { status: "error", message: error.message || "API request failed." };
  }
}
