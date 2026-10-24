<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$pdo = App\Database::pdo();
$stmt = $pdo->query(
    "SELECT employee_id, review_date, rating, bonus_amount FROM performance_ratings
      WHERE employee_id IN ('hris-e020','hris-e069','hris-e073','hris-e079','hris-e010',
                            'hris-e059','hris-e025','hris-e080','hris-e071','hris-e019')
      ORDER BY employee_id"
);
$rows = $stmt->fetchAll();
if (!$rows) { echo "PENDING\n"; exit; }
$seen = [];
foreach ($rows as $r) {
    printf("%-11s | %s | %-28s | bonus=%s\n", $r['employee_id'], $r['review_date'], $r['rating'], $r['bonus_amount']);
    $seen[$r['employee_id']] = ($seen[$r['employee_id']] ?? 0) + 1;
}
$dupes = array_filter($seen, static fn ($c) => $c > 1);
echo 'count=' . count($rows) . ' distinct=' . count($seen) . ($dupes ? ' DUPLICATES: ' . implode(',', array_keys($dupes)) : ' no duplicates') . "\n";
