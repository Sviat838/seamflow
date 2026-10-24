import Link from "next/link";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatCount, formatDate, formatPercent } from "@/components/ui/format";
import { RatingBadge } from "@/components/verdict/rating-badge";
import type { LeaderboardEntry } from "@/lib/types";

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <Table caption="Company leaderboard, ranked by HDX company score" captionHidden minWidth="52rem">
      <THead>
        <Tr>
          <Th align="right">Rank</Th>
          <Th>Company</Th>
          <Th>Score</Th>
          <Th align="right">Rated hot dogs</Th>
          <Th align="right">Certified</Th>
          <Th align="right">Classifications</Th>
          <Th align="right">Hot-dog share</Th>
          <Th>Last activity</Th>
        </Tr>
      </THead>
      <TBody>
        {entries.map((entry) => (
          <Tr key={entry.slug}>
            <Td align="right" numeric strong>
              {entry.rank}
            </Td>
            <Td strong>
              <Link
                href={`/companies/${entry.slug}`}
                className="inline-flex min-h-11 items-center text-navy underline underline-offset-2 hover:text-navy-hover"
              >
                {entry.name}
              </Link>
            </Td>
            <Td>
              <RatingBadge rating={entry.score} size="sm" />
            </Td>
            <Td align="right" numeric>
              {formatCount(entry.ratedHotDogs)}
            </Td>
            <Td align="right" numeric>
              {formatCount(entry.certifiedHotDogs)}
            </Td>
            <Td align="right" numeric>
              {formatCount(entry.totalScans)}
            </Td>
            <Td align="right" numeric>
              {formatPercent(entry.hotDogShare)}
            </Td>
            <Td numeric>{formatDate(entry.lastActivity)}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
