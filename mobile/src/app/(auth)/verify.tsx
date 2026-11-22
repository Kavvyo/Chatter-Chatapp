import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Asterisk, ArrowLeft } from 'lucide-react-native';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useToastStore } from '../../store/useToastStore';

export default function VerifyScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { authUser, isVerifying, OtpVerify, resendOtp, logOut } = useAuthStore();

  const [otp, setOtp] = useState('');
  const [counter, setCounter] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // Countdown timer for resending OTP
  useEffect(() => {
    if (counter === 0) return;
    const interval = setInterval(() => {
      setCounter((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [counter]);

  const handleVerify = async () => {
    if (!otp.trim()) {
      setErrorMessage('Please enter the 6-digit code');
      return;
    }
    if (otp.trim().length < 6) {
      setErrorMessage('Verification code must be 6 digits');
      return;
    }
    setErrorMessage('');

    const { showToast } = useToastStore.getState();

    if (!authUser?.email) {
      showToast('No authenticated user email found.', 'error');
      return;
    }

    const result = await OtpVerify({
      email: authUser.email,
      otp: otp.trim(),
    });

    if (!result.success) {
      setErrorMessage(result.message || 'Verification failed. Please check the code.');
      showToast(result.message || 'Incorrect verification code.', 'error');
    } else {
      showToast('Account verified successfully!', 'success');
    }
  };

  const handleResend = async () => {
    if (counter > 0 || !authUser?.email) return;
    const { showToast } = useToastStore.getState();
    const result = await resendOtp(authUser.email);
    if (result.success) {
      setCounter(60);
      showToast('A new verification code has been sent to your email.', 'success');
    } else {
      showToast(result.message || 'Failed to resend code', 'error');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.base100 }]} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Top Back/Logout button */}
        <TouchableOpacity
          onPress={logOut}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={22} color={theme.baseContent} />
          <Text style={[styles.backText, { color: theme.baseContent }]}>Log out</Text>
        </TouchableOpacity>

        {/* Header Icon */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: theme.primary + '18' }]}>
            <Asterisk size={40} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.baseContent }]}>Verify your account</Text>
          <Text style={[styles.subtitle, { color: theme.baseContentMuted }]}>
            We've sent a 6-digit verification code to
          </Text>
          <Text style={[styles.emailHighlight, { color: theme.primary }]}>
            {authUser?.email || 'your email'}
          </Text>
        </View>

        {/* Error message */}
        {Boolean(errorMessage) && (
          <View style={[styles.errorBox, { backgroundColor: theme.error + '20', borderColor: theme.error }]}>
            <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
          </View>
        )}

        {/* OTP Input */}
        <View style={styles.form}>
          <View
            style={[
              styles.otpInputWrapper,
              { backgroundColor: theme.base200, borderColor: theme.base300 },
            ]}
          >
            <TextInput
              value={otp}
              onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
              placeholder="••••••"
              placeholderTextColor={theme.baseContentMuted}
              keyboardType="number-pad"
              maxLength={6}
              style={[
                styles.otpInput,
                { color: theme.baseContent, letterSpacing: 12 },
              ]}
              autoFocus
            />
          </View>

          {/* Verify button */}
          <TouchableOpacity
            onPress={handleVerify}
            disabled={isVerifying || otp.length < 6}
            style={[
              styles.submitBtn,
              {
                backgroundColor: otp.length === 6 ? theme.primary : theme.base300,
              },
              isVerifying && { opacity: 0.7 },
            ]}
            activeOpacity={0.8}
          >
            {isVerifying ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.primaryContent} />
                <Text style={[styles.submitText, { color: theme.primaryContent }]}>
                  Verifying...
                </Text>
              </View>
            ) : (
              <Text style={[styles.submitText, { color: theme.primaryContent }]}>Verify</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Resend Code Section */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.baseContentMuted }]}>
            Didn't receive code?{' '}
          </Text>
          <TouchableOpacity onPress={handleResend} disabled={counter > 0}>
            <Text
              style={[
                styles.linkText,
                { color: counter > 0 ? theme.baseContentMuted : theme.primary },
              ]}
            >
              {counter > 0 ? `Wait ${counter}s` : 'Get new code'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 30,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  emailHighlight: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  form: {
    gap: 20,
  },
  otpInputWrapper: {
    borderRadius: 14,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpInput: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  submitBtn: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: {
    fontSize: 14,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
