<?php
declare(strict_types=1);

namespace App;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

final class EmailOtpService
{
    private const OTP_TTL_SECONDS = 600; // 10 minutes

    /**
     * Generate a 6-digit OTP code and store it in cache for this email.
     */
    public static function generateOtp(string $email, string $type = 'login'): string
    {
        $code = (string) random_int(100000, 999999);
        $key = self::cacheKey($email, $type);
        Cache::put($key, $code, self::OTP_TTL_SECONDS);
        return $code;
    }

    /**
     * Send OTP email via configured Laravel Mailer (Gmail SMTP).
     */
    public static function sendLoginOtp(string $email): void
    {
        $code = self::generateOtp($email, 'login');
        $senderName = (string) env('MAIL_FROM_NAME', 'TGLTI - Payroll System');
        $fromAddress = (string) env('MAIL_FROM_ADDRESS', 'ejluar901@gmail.com');

        try {
            Mail::raw(
                "Your {$senderName} verification code is: {$code}\n\nThis code is valid for 10 minutes.\nIf you did not request this code, please ignore this email.",
                static function ($message) use ($email, $code, $senderName, $fromAddress) {
                    $message->to($email)
                        ->from($fromAddress, $senderName)
                        ->subject("[{$senderName}] Your Login Verification Code: {$code}");
                }
            );
        } catch (\Throwable $e) {
            Log::error('Failed to send login OTP via Gmail SMTP: ' . $e->getMessage(), [
                'email' => $email,
                'exception' => $e,
            ]);
            Http::error('Unable to send verification email. Please check server email settings: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Send registration welcome / confirmation email via configured Laravel Mailer (Gmail SMTP).
     */
    public static function sendRegistrationWelcome(string $email, string $name): void
    {
        $senderName = (string) env('MAIL_FROM_NAME', 'TGLTI - Payroll System');
        $fromAddress = (string) env('MAIL_FROM_ADDRESS', 'ejluar901@gmail.com');

        try {
            Mail::raw(
                "Hello {$name},\n\nYour account has been successfully registered on {$senderName}.\n\nYou can now sign in using your email address ({$email}) and password.\nFor your security, a 6-digit one-time code will be sent to this email each time you log in.\n\nThank you,\n{$senderName} Team",
                static function ($message) use ($email, $senderName, $fromAddress) {
                    $message->to($email)
                        ->from($fromAddress, $senderName)
                        ->subject("[{$senderName}] Account Registration Confirmed");
                }
            );
        } catch (\Throwable $e) {
            Log::warning('Failed to send registration welcome email: ' . $e->getMessage(), [
                'email' => $email,
            ]);
            // Do not block registration if the welcome notification email fails
        }
    }

    /**
     * Send registration confirmation code via configured Laravel Mailer (Gmail SMTP).
     */
    public static function sendRegistrationOtp(string $email): void
    {
        $code = self::generateOtp($email, 'register');
        $senderName = (string) env('MAIL_FROM_NAME', 'TGLTI - Payroll System');
        $fromAddress = (string) env('MAIL_FROM_ADDRESS', 'ejluar901@gmail.com');

        try {
            Mail::raw(
                "Welcome to {$senderName}!\n\nYour registration verification code is: {$code}\n\nThis code will expire in 10 minutes.\nEnter this code to complete your account setup.",
                static function ($message) use ($email, $code, $senderName, $fromAddress) {
                    $message->to($email)
                        ->from($fromAddress, $senderName)
                        ->subject("[{$senderName}] Confirm Your Registration: {$code}");
                }
            );
        } catch (\Throwable $e) {
            Log::error('Failed to send registration OTP via Gmail SMTP: ' . $e->getMessage(), [
                'email' => $email,
                'exception' => $e,
            ]);
            Http::error('Unable to send verification email. Please check server email settings: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Verify the supplied OTP for an email.
     */
    public static function verifyOtp(string $email, string $code, string $type = 'login'): bool
    {
        $key = self::cacheKey($email, $type);
        $cached = Cache::get($key);

        if ($cached === null) {
            return false;
        }

        if (hash_equals((string) $cached, trim($code))) {
            Cache::forget($key);
            return true;
        }

        return false;
    }

    private static function cacheKey(string $email, string $type): string
    {
        return 'email_otp_' . $type . '_' . md5(strtolower(trim($email)));
    }
}
