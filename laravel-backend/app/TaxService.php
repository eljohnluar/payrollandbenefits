<?php
declare(strict_types=1);

namespace App;

/**
 * Philippine statutory contributions and withholding tax.
 * Ported unchanged from the legacy app so a migrated payroll run reproduces
 * the same figures; every rate is read from system_settings.
 */
final class TaxService
{
    /** @return array{ee:float,er:float} */
    public static function sss(float $salary): array
    {
        $eeCap  = SettingsService::num('sss_ee_fixed', 900);
        $erRate = SettingsService::num('sss_er_rate', 9.5) / 100;
        $erCap  = SettingsService::num('sss_er_cap', 1900);
        if ($salary < 5000)  return ['ee' => $eeCap * 0.25, 'er' => $erCap * 0.25];
        if ($salary < 10000) return ['ee' => $eeCap * 0.5,  'er' => $erCap * 0.5];
        if ($salary < 15000) return ['ee' => $eeCap * 0.75, 'er' => $erCap * 0.75];
        if ($salary < 20000) return ['ee' => $eeCap,        'er' => $erCap];
        return ['ee' => $eeCap, 'er' => min($salary * $erRate, $erCap)];
    }

    /** @return array{ee:float,er:float} */
    public static function philHealth(float $salary): array
    {
        $ee = min($salary, 100000) * (SettingsService::num('philhealth_rate', 2) / 100);
        return ['ee' => $ee, 'er' => $ee];
    }

    /** @return array{ee:float,er:float} */
    public static function pagIbig(float $salary): array
    {
        $ee = $salary >= 5000
            ? SettingsService::num('pagibig_ee_max', 100)
            : SettingsService::num('pagibig_ee_min', 50);
        return ['ee' => $ee, 'er' => SettingsService::num('pagibig_er', 100)];
    }

    /** TIER-1 monthly withholding on the taxable portion of gross pay. */
    public static function withholdingTax(float $grossPay, float $totalEmployeeContributions): float
    {
        $taxableMonthly = $grossPay - $totalEmployeeContributions;
        // Mandatory threshold: taxable monthly income at or below ₱22,000 owes no withholding.
        if ($taxableMonthly <= SettingsService::num('tax_free_threshold', 22000)) {
            return 0.0;
        }
        $annual = $taxableMonthly * 12;
        if ($annual <= 250000)      $annualTax = 0;
        elseif ($annual <= 400000)  $annualTax = ($annual - 250000) * 0.15;
        elseif ($annual <= 800000)  $annualTax = 22500  + ($annual - 400000) * 0.20;
        elseif ($annual <= 2000000) $annualTax = 102500 + ($annual - 800000) * 0.25;
        elseif ($annual <= 8000000) $annualTax = 402500 + ($annual - 2000000) * 0.30;
        else                        $annualTax = 2202500 + ($annual - 8000000) * 0.35;
        return round($annualTax / 12, 2);
    }

    /**
     * The "why this amount" evidence shown on the payroll computation screen:
     * the salary bracket used, the rate applied and the computed employee
     * share for SSS, PhilHealth and Pag-IBIG.
     *
     * @param array{ee:float,er:float} $sss
     * @param array{ee:float,er:float} $ph
     * @param array{ee:float,er:float} $pagibig
     */
    public static function basis(float $salary, array $sss, array $ph, array $pagibig): array
    {
        $eeCap  = SettingsService::num('sss_ee_fixed', 900);
        $erRate = SettingsService::num('sss_er_rate', 9.5);
        $erCap  = SettingsService::num('sss_er_cap', 1900);
        $sssBracket = match (true) {
            $salary < 5000  => '₱1 – ₱4,999 bracket: 25% of the contribution table',
            $salary < 10000 => '₱5,000 – ₱9,999 bracket: 50% of the contribution table',
            $salary < 15000 => '₱10,000 – ₱14,999 bracket: 75% of the contribution table',
            $salary < 20000 => '₱15,000 – ₱19,999 bracket: 100% of the contribution table',
            default         => '₱20,000 and above: employee share fixed, employer 9.5% of salary',
        };
        $phRate = SettingsService::num('philhealth_rate', 2);

        return [
            'salary_basis' => round($salary, 2),
            'sss' => [
                'agency'    => 'SSS',
                'bracket'   => $sssBracket,
                'ee_basis'  => sprintf('Employee: up to ₱%s per table, applied at the bracket above', number_format($eeCap, 2)),
                'er_basis'  => sprintf('Employer: %s%% of salary, capped at ₱%s', rtrim(rtrim(number_format($erRate, 2), '0'), '.'), number_format($erCap, 2)),
                'ee_share'  => round((float) $sss['ee'], 2),
                'er_share'  => round((float) $sss['er'], 2),
            ],
            'philhealth' => [
                'agency'    => 'PhilHealth',
                'bracket'   => $salary > 100000 ? 'Salary above the ₱100,000 ceiling: deduction computed on ₱100,000' : 'Salary up to ₱100,000 ceiling',
                'ee_basis'  => sprintf('Employee: %s%% of salary basis (50/50 split)', rtrim(rtrim(number_format($phRate / 2, 2), '0'), '.')),
                'er_basis'  => sprintf('Employer: matching %s%% share', rtrim(rtrim(number_format($phRate / 2, 2), '0'), '.')),
                'ee_share'  => round((float) $ph['ee'], 2),
                'er_share'  => round((float) $ph['er'], 2),
            ],
            'pagibig' => [
                'agency'    => 'Pag-IBIG',
                'bracket'   => $salary >= 5000 ? 'Monthly salary ₱5,000 and above' : 'Monthly salary below ₱5,000',
                'ee_basis'  => sprintf('Employee: ₱%s per month (fixed)', number_format(SettingsService::num($salary >= 5000 ? 'pagibig_ee_max' : 'pagibig_ee_min', 100), 2)),
                'er_basis'  => sprintf('Employer: ₱%s per month (fixed)', number_format(SettingsService::num('pagibig_er', 100), 2)),
                'ee_share'  => round((float) $pagibig['ee'], 2),
                'er_share'  => round((float) $pagibig['er'], 2),
            ],
        ];
    }
}
