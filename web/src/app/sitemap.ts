import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = "https://canvas.tree456.com";

    // Static site pages to be indexed by search engines
    const routes = ["", "/canvas", "/prompts", "/assets"].map((route) => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date(),
        changeFrequency: "daily" as const,
        priority: route === "" ? 1.0 : 0.8,
    }));

    return routes;
}
