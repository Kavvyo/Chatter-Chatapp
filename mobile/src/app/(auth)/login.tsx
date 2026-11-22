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
import { Mail, Lock, Eye, EyeOff } from 'lucide-react-native';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useToastStore } from '../../store/useToastStore';
import Logo from '../../components/ui/Logo';

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { logIn, isLoggingIn } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('Please fill in all fields');
      return;
    }
    setErrorMessage('');
    const { showToast } = useToastStore.getState();
    const result = await logIn({ email: email.trim(), password });
    if (!result.success) {
      setErrorMessage(result.message || 'Login failed. Please check your credentials.');
      showToast(result.message || 'Please check your email and password.', 'error');
    } else {
      showToast('Welcome back!', 'success');
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
          <Text style={[styles.title, { color: theme.baseContent }]}>Welcome Back</Text>
          <Text style={[styles.subtitle, { color: theme.baseContentMuted }]}>
            Sign in to your account
          </Text>
        </View>

        {/* Error notice */}
        {Boolean(errorMessage) && (
          <View style={[styles.errorBox, { backgroundColor: theme.error + '20', borderColor: theme.error }]}>
            <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
          </View>
        )}

        {/* Form Inputs */}
        <View style={styles.form}>
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
            onPress={handleLogin}
            disabled={isLoggingIn}
            style={[
              styles.submitBtn,
              { backgroundColor: theme.primary },
              isLoggingIn && { opacity: 0.7 },
            ]}
            activeOpacity={0.8}
          >
            {isLoggingIn ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.primaryContent} />
                <Text style={[styles.submitText, { color: theme.primaryContent }]}>
                  Signing in...
                </Text>
              </View>
            ) : (
              <Text style={[styles.submitText, { color: theme.primaryContent }]}>Sign in</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer Link */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.baseContentMuted }]}>
            Don't have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup' as any)}>
            <Text style={[styles.linkText, { color: theme.primary }]}>Create account</Text>
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
    gap: 18,
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
