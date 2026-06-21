import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/api/", "/canvas/"], // Disallows indexing internal API paths and individual private canvas workspaces (e.g. /canvas/[id])
        },
        sitemap: "https://canvas.tree456.com/sitemap.xml",
    };
}
