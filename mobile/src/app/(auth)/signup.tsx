import React, { useState } from 'react';
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
import { User, Mail, Lock, Eye, EyeOff } from 'lucide-react-native';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useToastStore } from '../../store/useToastStore';
import Logo from '../../components/ui/Logo';

export default function SignUpScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { signUp, isSigningUp } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const validateForm = () => {
    if (!fullName.trim()) {
      setErrorMessage('Full name is required');
      return false;
    }
    if (!email.trim()) {
      setErrorMessage('Email is required');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setErrorMessage('Please enter a valid email address');
      return false;
    }
    if (!password) {
      setErrorMessage('Password is required');
      return false;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;
    setErrorMessage('');

    const result = await signUp({
      fullName: fullName.trim(),
      email: email.trim(),
      password,
    });

    const { showToast } = useToastStore.getState();
    if (!result.success) {
      setErrorMessage(result.message || 'Signup failed. Please try again.');
      showToast(result.message || 'Could not create account.', 'error');
    } else {
      showToast('Account created! Please check your email for the verification code.', 'success');
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
        {/* Header with Logo */}
        <View style={styles.header}>
          <View style={[styles.logoContainer, { backgroundColor: theme.primary + '18' }]}>
            <Logo size={32} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.baseContent }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: theme.baseContentMuted }]}>
            Get started with your free account
          </Text>
        </View>

        {/* Error message */}
        {Boolean(errorMessage) && (
          <View style={[styles.errorBox, { backgroundColor: theme.error + '20', borderColor: theme.error }]}>
            <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
          </View>
        )}

        {/* Form Inputs */}
        <View style={styles.form}>
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.baseContent }]}>Full Name</Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: theme.base200, borderColor: theme.base300 },
              ]}
            >
              <User size={20} color={theme.baseContentMuted} style={styles.inputIcon} />
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="John Doe"
                placeholderTextColor={theme.baseContentMuted}
                autoCorrect={false}
                style={[styles.input, { color: theme.baseContent }]}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.baseContent }]}>Email</Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: theme.base200, borderColor: theme.base300 },
              ]}
            >
              <Mail size={20} color={theme.baseContentMuted} style={styles.inputIcon} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={theme.baseContentMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: theme.baseContent }]}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.baseContent }]}>Password</Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: theme.base200, borderColor: theme.base300 },
              ]}
            >
              <Lock size={20} color={theme.baseContentMuted} style={styles.inputIcon} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={theme.baseContentMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={[styles.input, { color: theme.baseContent }]}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {showPassword ? (
                  <EyeOff size={20} color={theme.baseContentMuted} />
                ) : (
                  <Eye size={20} color={theme.baseContentMuted} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleSignUp}
            disabled={isSigningUp}
            style={[
              styles.submitBtn,
              { backgroundColor: theme.primary },
              isSigningUp && { opacity: 0.7 },
            ]}
            activeOpacity={0.8}
          >
            {isSigningUp ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.primaryContent} />
                <Text style={[styles.submitText, { color: theme.primaryContent }]}>
                  Creating account...
                </Text>
              </View>
            ) : (
              <Text style={[styles.submitText, { color: theme.primaryContent }]}>
                Create Account
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer Link */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.baseContentMuted }]}>
            Already have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login' as any)}>
            <Text style={[styles.linkText, { color: theme.primary }]}>Sign in</Text>
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
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
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
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    height: '100%',
  },
  eyeBtn: {
    padding: 6,
  },
  submitBtn: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
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
