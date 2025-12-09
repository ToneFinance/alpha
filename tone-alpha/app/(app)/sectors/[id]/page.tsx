import { notFound } from "next/navigation";
import { getSectorById, getAllSectors } from "@/lib/sectors";
import { SectorDetailClient } from "./SectorDetailClient";

// Generate static paths for all sectors
export function generateStaticParams() {
  const sectors = getAllSectors();
  return sectors.map((sector) => ({
    id: sector.id,
  }));
}

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function SectorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const sector = getSectorById(id);

  // If sector not found, show 404
  if (!sector) {
    notFound();
  }

  return <SectorDetailClient sector={sector} />;
}
