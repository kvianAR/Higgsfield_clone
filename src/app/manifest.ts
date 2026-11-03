import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "CINQRA — AI Creative Studio",
        short_name: "CINQRA",
        description: "Cinema, Reimagined. Independent AI creative tools.",
        start_url: "/",
        display: "standalone",
        background_color: "#060606",
        theme_color: "#d5ff47",
        icons: [{ src: "/cinqra/app-icon.png", sizes: "1024x1024", type: "image/png" }],
    };
}
