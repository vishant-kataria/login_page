// ============================================
// Sign-in Page Logic
// Multi-step flow: Credentials → OTP Method → OTP Verify
// Forgot Password: Identifier → Method (email/phone) → OTP + Reset
// ============================================

(function () {
    'use strict';

    // --- Step Elements ---
    const steps = {
        credentials: document.getElementById('step-credentials'),
        otpMethod: document.getElementById('step-otp-method'),
        otpVerify: document.getElementById('step-otp-verify'),
        forgotPassword: document.getElementById('step-forgot-password'),
        forgotMethod: document.getElementById('step-forgot-method'),
        resetPassword: document.getElementById('step-reset-password'),
    };

    // --- Forms ---
    const credentialsForm = document.getElementById('credentialsForm');
    const otpVerifyForm = document.getElementById('otpVerifyForm');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');

    // --- Buttons ---
    const signinBtn = document.getElementById('signinBtn');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const findAccountBtn = document.getElementById('findAccountBtn');
    const resetPasswordBtn = document.getElementById('resetPasswordBtn');
    const resendOtpBtn = document.getElementById('resend-otp-btn');

    // --- Error Messages ---
    const credentialsError = document.getElementById('credentials-error');
    const otpMethodError = document.getElementById('otp-method-error');
    const otpVerifyError = document.getElementById('otp-verify-error');
    const forgotPasswordError = document.getElementById('forgot-password-error');
    const forgotMethodError = document.getElementById('forgot-method-error');
    const resetPasswordError = document.getElementById('reset-password-error');

    // --- OTP Digit Inputs ---
    const otpDigits = document.querySelectorAll('.otp-digit');

    // --- State ---
    let userEmail = '';
    let otpMethod = ''; // 'email' or 'phone'
    let forgotResetMethod = ''; // 'email' or 'phone'
    let countdownInterval = null;

    // ============================================
    // Utility: Switch Steps
    // ============================================
    function showStep(stepName) {
        Object.values(steps).forEach(step => {
            step.classList.remove('active');
            step.classList.add('hidden');
        });
        steps[stepName].classList.remove('hidden');
        steps[stepName].classList.add('active');
    }

    // ============================================
    // Utility: Set button loading state
    // ============================================
    function setLoading(btn, loading, originalText) {
        if (loading) {
            btn.disabled = true;
            btn.dataset.originalText = btn.textContent;
            btn.textContent = '';
            btn.classList.add('loading');
        } else {
            btn.disabled = false;
            btn.textContent = originalText || btn.dataset.originalText || 'Submit';
            btn.classList.remove('loading');
        }
    }

    // ============================================
    // Utility: Mask email (e.g., v***@gmail.com)
    // ============================================
    function maskEmail(email) {
        const [local, domain] = email.split('@');
        if (local.length <= 2) return local[0] + '***@' + domain;
        return local[0] + '***' + local[local.length - 1] + '@' + domain;
    }

    // ============================================
    // OTP Individual Digit Input Handling
    // ============================================
    otpDigits.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            e.target.value = value.replace(/\D/g, '');
            if (e.target.value && index < otpDigits.length - 1) {
                otpDigits[index + 1].focus();
            }
            e.target.classList.toggle('filled', !!e.target.value);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                otpDigits[index - 1].focus();
                otpDigits[index - 1].value = '';
                otpDigits[index - 1].classList.remove('filled');
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '');
            for (let i = 0; i < otpDigits.length; i++) {
                otpDigits[i].value = pasted[i] || '';
                otpDigits[i].classList.toggle('filled', !!otpDigits[i].value);
            }
            const focusIndex = Math.min(pasted.length, otpDigits.length - 1);
            otpDigits[focusIndex].focus();
        });
    });

    function getOtpValue() {
        return Array.from(otpDigits).map(d => d.value).join('');
    }

    function clearOtpInputs() {
        otpDigits.forEach(d => {
            d.value = '';
            d.classList.remove('filled');
        });
    }

    // ============================================
    // Countdown Timer for Resend OTP
    // ============================================
    function startCountdown(seconds) {
        const timerEl = document.getElementById('resend-timer');
        const countdownEl = document.getElementById('countdown');

        resendOtpBtn.classList.add('hidden');
        timerEl.classList.remove('hidden');
        countdownEl.textContent = seconds;

        if (countdownInterval) clearInterval(countdownInterval);

        countdownInterval = setInterval(() => {
            seconds--;
            countdownEl.textContent = seconds;
            if (seconds <= 0) {
                clearInterval(countdownInterval);
                timerEl.classList.add('hidden');
                resendOtpBtn.classList.remove('hidden');
            }
        }, 1000);
    }

    // ============================================
    // Step 1: Credentials Submission
    // ============================================
    credentialsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        credentialsError.textContent = '';

        const identifier = document.getElementById('signin-identifier').value.trim();
        const password = document.getElementById('signin-password').value;

        if (!identifier || !password) {
            credentialsError.textContent = 'Please fill in all fields.';
            return;
        }

        setLoading(signinBtn, true);

        try {
            const response = await fetch('/api/signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                credentialsError.textContent = data.message || 'Invalid email or password.';
                setLoading(signinBtn, false, 'Sign In');
                return;
            }

            // Credentials verified — move to OTP method selection
            userEmail = data.email;
            document.getElementById('otp-masked-email').textContent = 'Send code to ' + maskEmail(data.email);

            // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
            // const smsBtn = document.getElementById('otp-sms-btn');
            // if (data.maskedPhone) {
            //     document.getElementById('otp-masked-phone').textContent = 'Send code to ' + data.maskedPhone;
            //     smsBtn.classList.remove('hidden');
            // } else {
            //     smsBtn.classList.add('hidden');
            // }

            showStep('otpMethod');
            setLoading(signinBtn, false, 'Sign In');
        } catch (err) {
            credentialsError.textContent = 'Network error. Please try again.';
            setLoading(signinBtn, false, 'Sign In');
        }
    });

    // ============================================
    // Step 2: OTP Method Selection
    // ============================================
    document.getElementById('otp-email-btn').addEventListener('click', () => {
        otpMethod = 'email';
        sendSigninOtp('email');
    });

    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
    // document.getElementById('otp-sms-btn').addEventListener('click', () => {
    //     otpMethod = 'phone';
    //     sendSigninOtp('phone');
    // });

    async function sendSigninOtp(method) {
        otpMethod = method;
        otpMethodError.textContent = '';

        try {
            const response = await fetch('/api/signin/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userEmail, channel: method }),
            });

            const data = await response.json();

            if (!response.ok) {
                otpMethodError.textContent = data.message || 'Failed to send OTP.';
                return;
            }

            const destination = method === 'email'
                ? maskEmail(userEmail)
                : document.getElementById('otp-masked-phone').textContent.replace('Send code to ', '');
            document.getElementById('otp-destination').textContent = destination;

            clearOtpInputs();
            showStep('otpVerify');
            otpDigits[0].focus();
            startCountdown(60);
        } catch (err) {
            otpMethodError.textContent = 'Network error. Please try again.';
        }
    }

    // ============================================
    // Step 3: OTP Verification
    // ============================================
    otpVerifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        otpVerifyError.textContent = '';

        const otp = getOtpValue();
        if (otp.length !== 6) {
            otpVerifyError.textContent = 'Please enter the complete 6-digit code.';
            return;
        }

        setLoading(verifyOtpBtn, true);

        try {
            const response = await fetch('/api/signin/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userEmail, otp, channel: otpMethod }),
            });

            const data = await response.json();

            if (!response.ok) {
                otpVerifyError.textContent = data.message || 'Invalid code. Please try again.';
                setLoading(verifyOtpBtn, false, 'Verify & Sign In');
                return;
            }

            // Sign-in success!
            if (countdownInterval) clearInterval(countdownInterval);
            localStorage.setItem('user', JSON.stringify({
                username: data.user.username,
                email: data.user.email
            }));
            window.location.href = '../landing.html';
        } catch (err) {
            otpVerifyError.textContent = 'Network error. Please try again.';
            setLoading(verifyOtpBtn, false, 'Verify & Sign In');
        }
    });

    // Resend OTP
    resendOtpBtn.addEventListener('click', () => {
        sendSigninOtp(otpMethod);
    });

    // ============================================
    // Forgot Password: Step 1 — Find Account
    // ============================================
    document.getElementById('forgot-password-link').addEventListener('click', (e) => {
        e.preventDefault();
        forgotPasswordError.textContent = '';
        showStep('forgotPassword');
    });

    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        forgotPasswordError.textContent = '';

        const identifier = document.getElementById('reset-identifier').value.trim();
        if (!identifier) {
            forgotPasswordError.textContent = 'Please enter your email or username.';
            return;
        }

        setLoading(findAccountBtn, true);

        try {
            const response = await fetch('/api/signin/forgot-password/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier }),
            });

            const data = await response.json();

            if (!response.ok) {
                forgotPasswordError.textContent = data.message || 'Account not found.';
                setLoading(findAccountBtn, false, 'Find Account');
                return;
            }

            // Store email for next steps
            userEmail = data.email;

            // Show method selection
            document.getElementById('forgot-masked-email').textContent = 'Send code to ' + data.maskedEmail;
            // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
            // const forgotPhoneBtn = document.getElementById('forgot-phone-btn');
            // if (data.maskedPhone) {
            //     document.getElementById('forgot-masked-phone').textContent = 'Send code to ' + data.maskedPhone;
            //     forgotPhoneBtn.classList.remove('hidden');
            // } else {
            //     forgotPhoneBtn.classList.add('hidden');
            // }

            showStep('forgotMethod');
            setLoading(findAccountBtn, false, 'Find Account');
        } catch (err) {
            forgotPasswordError.textContent = 'Network error. Please try again.';
            setLoading(findAccountBtn, false, 'Find Account');
        }
    });

    // ============================================
    // Forgot Password: Step 2 — Choose method
    // ============================================
    document.getElementById('forgot-email-btn').addEventListener('click', () => {
        forgotResetMethod = 'email';
        sendForgotOtp('email');
    });

    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
    // document.getElementById('forgot-phone-btn').addEventListener('click', () => {
    //     forgotResetMethod = 'phone';
    //     sendForgotOtp('phone');
    // });

    async function sendForgotOtp(method) {
        forgotResetMethod = method;
        forgotMethodError.textContent = '';

        try {
            const response = await fetch('/api/signin/forgot-password/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userEmail, channel: method }),
            });

            const data = await response.json();

            if (!response.ok) {
                forgotMethodError.textContent = data.message || 'Failed to send reset code.';
                return;
            }

            const destination = method === 'email'
                ? document.getElementById('forgot-masked-email').textContent.replace('Send code to ', '')
                : document.getElementById('forgot-masked-phone').textContent.replace('Send code to ', '');
            document.getElementById('reset-destination').textContent = destination;

            showStep('resetPassword');
        } catch (err) {
            forgotMethodError.textContent = 'Network error. Please try again.';
        }
    }

    // ============================================
    // Forgot Password: Step 3 — Enter OTP + new password
    // ============================================
    resetPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        resetPasswordError.textContent = '';

        const otp = document.getElementById('reset-otp').value.trim();
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-new-password').value;

        if (newPassword !== confirmPassword) {
            resetPasswordError.textContent = 'Passwords do not match.';
            return;
        }

        if (newPassword.length < 6) {
            resetPasswordError.textContent = 'Password must be at least 6 characters.';
            return;
        }

        setLoading(resetPasswordBtn, true);

        try {
            const response = await fetch('/api/signin/forgot-password/verify-and-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userEmail, otp, channel: forgotResetMethod, newPassword }),
            });

            const data = await response.json();

            if (!response.ok) {
                resetPasswordError.textContent = data.message || 'Reset failed.';
                setLoading(resetPasswordBtn, false, 'Reset Password');
                return;
            }

            alert('Password reset successfully! Please sign in with your new password.');
            showStep('credentials');
            setLoading(resetPasswordBtn, false, 'Reset Password');
        } catch (err) {
            resetPasswordError.textContent = 'Network error. Please try again.';
            setLoading(resetPasswordBtn, false, 'Reset Password');
        }
    });

    // ============================================
    // Back Buttons
    // ============================================
    document.getElementById('back-to-credentials').addEventListener('click', () => {
        showStep('credentials');
    });

    document.getElementById('back-to-method').addEventListener('click', () => {
        if (countdownInterval) clearInterval(countdownInterval);
        showStep('otpMethod');
    });

    document.getElementById('back-from-forgot-password').addEventListener('click', () => {
        showStep('credentials');
    });

    document.getElementById('back-from-forgot-method').addEventListener('click', () => {
        showStep('forgotPassword');
    });

    document.getElementById('back-from-reset').addEventListener('click', () => {
        showStep('forgotMethod');
    });

})();
