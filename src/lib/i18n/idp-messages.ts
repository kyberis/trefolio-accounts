import type { IdpLocale } from "@/lib/i18n/idp-locale";

export type IdpEmailStrings = {
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  fallbackLink: string;
  expiry: string;
  ignore: string;
  htmlLang: string;
  footerLine: string;
};

export type IdpUiCopy = {
  languageLabel: string;
  headingSignup: string;
  headingLogin: string;
  subtitleSignup: string;
  subtitleLogin: string;
  continueToPrefix: string;
  invalidClientBanner: string;
  errInvalidCredentialsSignup: string;
  errInvalidCredentialsLogin: string;
  errPasswordMismatch: string;
  errPasswordTooShort: string;
  errVerificationEmailFailed: string;
  errBlockedEmailDomain: string;
  errInvalidClient: string;
  dividerEmail: string;
  googleCta: string;
  passkeySignIn: string;
  passkeyWaiting: string;
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholderNew: string;
  passwordPlaceholderLogin: string;
  passwordRepeat: string;
  passwordRepeatPlaceholder: string;
  createAccount: string;
  alreadyHaveAccount: string;
  signIn: string;
  newHere: string;
  createNewAccount: string;
  signInButton: string;
  legalIntro: string;
  legalTerms: string;
  legalAnd: string;
  legalPrivacy: string;
  devSeeds: string;
  footerPrivacy: string;
  footerTerms: string;
  footerContact: string;
  checkEmailTitle: string;
  checkEmailSubtitle: string;
  checkEmailBody1: string;
  checkEmailBody2: string;
  checkEmailVerifyWord: string;
  checkEmailBody3: string;
  checkEmailHost: string;
  checkEmailBody4: string;
  wrongInbox: string;
  startOver: string;
  resendSent: string;
  resendError: string;
  resendSending: string;
  resendCooldownPrefix: string;
  resendCooldownSuffix: string;
  resendButton: string;
  emailConfirmedTitle: string;
  emailConfirmedSubtitle: string;
  emailConfirmedCountdownBefore: string;
  emailConfirmedCountdownAfter: string;
  homeTitle: string;
  homeBody: string;
  homeSignInHintBefore: string;
  homeSignInCta: string;
  homeSignInHintAfter: string;
  productPortfolio: string;
  productAssistant: string;
  productNotes: string;
};

const en: IdpUiCopy & { email: IdpEmailStrings } = {
  languageLabel: "Language",
  headingSignup: "Create your account",
  headingLogin: "Welcome back",
  subtitleSignup: "One password for trefolio, Clara, and Will.",
  subtitleLogin: "Sign in with your trefolio account",
  continueToPrefix: "Continue to",
  invalidClientBanner:
    "This sign-in link is invalid or expired. Please open the app you came from and try again.",
  errInvalidCredentialsSignup:
    "This email already has an account. Enter your password to continue, or sign in with Google.",
  errInvalidCredentialsLogin: "Email or password is incorrect.",
  errPasswordMismatch: "Passwords do not match. Type the same password twice.",
  errPasswordTooShort: "Password must be at least 8 characters.",
  errVerificationEmailFailed:
    "We couldn’t send the verification email. Check RESEND_API_KEY on the server or try again.",
  errBlockedEmailDomain:
    "Disposable email addresses are not allowed. Please use a real email.",
  errInvalidClient: "This sign-in link is invalid.",
  dividerEmail: "or with email",
  googleCta: "Continue with Google",
  passkeySignIn: "Sign in with a passkey",
  passkeyWaiting: "Waiting for passkey…",
  nameLabel: "Your name",
  namePlaceholder: "How should we call you?",
  emailLabel: "Email",
  emailPlaceholder: "you@example.com",
  passwordLabel: "Password",
  passwordPlaceholderNew: "At least 8 characters",
  passwordPlaceholderLogin: "••••••••",
  passwordRepeat: "Repeat password",
  passwordRepeatPlaceholder: "Same as above",
  createAccount: "Create a new account",
  alreadyHaveAccount: "Already have an account?",
  signIn: "Sign in",
  newHere: "New here?",
  createNewAccount: "Create a new account",
  signInButton: "Sign in",
  legalIntro: "By continuing you agree to trefolio’s",
  legalTerms: "Terms",
  legalAnd: "and",
  legalPrivacy: "Privacy Policy",
  devSeeds: "Dev seeds:",
  footerPrivacy: "Privacy",
  footerTerms: "Terms",
  footerContact: "Contact",
  checkEmailTitle: "Check your email",
  checkEmailSubtitle: "We sent a verification link to confirm your trefolio account.",
  checkEmailBody1: "Open the message we sent to",
  checkEmailBody2: "and tap",
  checkEmailVerifyWord: "Verify Email",
  checkEmailBody3: "The link opens on",
  checkEmailHost: "user.trefolio.com",
  checkEmailBody4: "and expires in 24 hours.",
  wrongInbox: "Wrong inbox?",
  startOver: "Start over",
  resendSent: "Verification email sent again.",
  resendError: "Could not resend.",
  resendSending: "Sending…",
  resendCooldownPrefix: "Resend available in ",
  resendCooldownSuffix: "s",
  resendButton: "Resend verification email",
  emailConfirmedTitle: "Email confirmed",
  emailConfirmedSubtitle:
    "Your email is verified. You can use this account on trefolio, Clara, and Will.",
  emailConfirmedCountdownBefore: "Continuing to your app in",
  emailConfirmedCountdownAfter: "s…",
  homeTitle: "One account for trefolio, Clara, and Will.",
  homeBody:
    "You’re on the trefolio identity service. Use your trefolio account to sign in securely to all our products with the same email and password.",
  homeSignInHintBefore: "To sign in, open trefolio, Clara or Will and click ",
  homeSignInCta: "Sign in",
  homeSignInHintAfter: ". You’ll be brought back here to authenticate.",
  productPortfolio: "Portfolio dashboard",
  productAssistant: "Personal finance assistant",
  productNotes: "Smart notes assistant",
  email: {
    subject: "Verify your email — trefolio",
    heading: "Verify your email address",
    body: "Thanks for signing up! Please confirm your email to activate your trefolio account — one sign-in for trefolio, Clara, and Will.",
    ctaLabel: "Verify Email",
    fallbackLink: "Or copy and paste this link into your browser:",
    expiry: "This link expires in 24 hours.",
    ignore: "If you didn’t start creating a trefolio account, you can ignore this email.",
    htmlLang: "en",
    footerLine: "Every portfolio deserves a bit of luck 🍀",
  },
};

const de: IdpUiCopy & { email: IdpEmailStrings } = {
  languageLabel: "Sprache",
  headingSignup: "Konto erstellen",
  headingLogin: "Willkommen zurück",
  subtitleSignup: "Ein Passwort für trefolio, Clara und Will.",
  subtitleLogin: "Mit deinem trefolio-Konto anmelden",
  continueToPrefix: "Weiter zu",
  invalidClientBanner:
    "Dieser Anmeldelink ist ungültig oder abgelaufen. Bitte öffne die App, von der du kommst, und versuche es erneut.",
  errInvalidCredentialsSignup:
    "Zu dieser E-Mail gibt es bereits ein Konto. Gib dein Passwort ein, um fortzufahren, oder melde dich mit Google an.",
  errInvalidCredentialsLogin: "E-Mail oder Passwort ist falsch.",
  errPasswordMismatch: "Die Passwörter stimmen nicht überein. Zweimal dasselbe Passwort eingeben.",
  errPasswordTooShort: "Das Passwort muss mindestens 8 Zeichen haben.",
  errVerificationEmailFailed:
    "Die Bestätigungs-E-Mail konnte nicht gesendet werden. Prüfe RESEND_API_KEY auf dem Server oder versuche es erneut.",
  errBlockedEmailDomain:
    "Wegwerf-E-Mail-Adressen sind nicht erlaubt. Bitte verwenden Sie eine echte E-Mail-Adresse.",
  errInvalidClient: "Dieser Anmeldelink ist ungültig.",
  dividerEmail: "oder mit E-Mail",
  googleCta: "Mit Google fortfahren",
  passkeySignIn: "Mit Passkey anmelden",
  passkeyWaiting: "Warte auf Passkey…",
  nameLabel: "Dein Name",
  namePlaceholder: "Wie sollen wir dich nennen?",
  emailLabel: "E-Mail",
  emailPlaceholder: "du@beispiel.de",
  passwordLabel: "Passwort",
  passwordPlaceholderNew: "Mindestens 8 Zeichen",
  passwordPlaceholderLogin: "••••••••",
  passwordRepeat: "Passwort wiederholen",
  passwordRepeatPlaceholder: "Wie oben",
  createAccount: "Neues Konto erstellen",
  alreadyHaveAccount: "Du hast schon ein Konto?",
  signIn: "Anmelden",
  newHere: "Neu hier?",
  createNewAccount: "Neues Konto erstellen",
  signInButton: "Anmelden",
  legalIntro: "Wenn du fortfährst, stimmst du den",
  legalTerms: "Nutzungsbedingungen",
  legalAnd: "und der",
  legalPrivacy: "Datenschutzerklärung",
  devSeeds: "Dev-Testkonten:",
  footerPrivacy: "Datenschutz",
  footerTerms: "AGB",
  footerContact: "Kontakt",
  checkEmailTitle: "E-Mail prüfen",
  checkEmailSubtitle: "Wir haben dir einen Bestätigungslink für dein trefolio-Konto geschickt.",
  checkEmailBody1: "Öffne die Nachricht an",
  checkEmailBody2: "und tippe auf",
  checkEmailVerifyWord: "E-Mail bestätigen",
  checkEmailBody3: "Der Link öffnet sich auf",
  checkEmailHost: "user.trefolio.com",
  checkEmailBody4: "und ist 24 Stunden gültig.",
  wrongInbox: "Falsche Mailbox?",
  startOver: "Von vorne beginnen",
  resendSent: "Bestätigungs-E-Mail erneut gesendet.",
  resendError: "Erneutes Senden fehlgeschlagen.",
  resendSending: "Wird gesendet…",
  resendCooldownPrefix: "Erneut senden in ",
  resendCooldownSuffix: "s",
  resendButton: "Bestätigungs-E-Mail erneut senden",
  emailConfirmedTitle: "E-Mail bestätigt",
  emailConfirmedSubtitle:
    "Deine E-Mail ist verifiziert. Du kannst dieses Konto bei trefolio, Clara und Will nutzen.",
  emailConfirmedCountdownBefore: "Weiter zur App in",
  emailConfirmedCountdownAfter: "s…",
  homeTitle: "Ein Konto für trefolio, Clara und Will.",
  homeBody:
    "Du bist beim trefolio-Identitätsdienst. Nutze dein trefolio-Konto, um dich sicher bei allen Produkten mit derselben E-Mail und demselben Passwort anzumelden.",
  homeSignInHintBefore: "Zum Anmelden öffne trefolio, Clara oder Will und tippe auf ",
  homeSignInCta: "Anmelden",
  homeSignInHintAfter: ". Du wirst hierher zurückgeführt, um dich zu authentifizieren.",
  productPortfolio: "Portfolio-Dashboard",
  productAssistant: "Persönlicher Finanzassistent",
  productNotes: "Assistent für intelligente Notizen",
  email: {
    subject: "E-Mail bestätigen — trefolio",
    heading: "E-Mail-Adresse bestätigen",
    body: "Danke für deine Registrierung! Bitte bestätige deine E-Mail, um dein trefolio-Konto zu aktivieren — eine Anmeldung für trefolio, Clara und Will.",
    ctaLabel: "E-Mail bestätigen",
    fallbackLink: "Oder kopiere diesen Link und füge ihn in den Browser ein:",
    expiry: "Dieser Link ist 24 Stunden gültig.",
    ignore: "Wenn du kein trefolio-Konto anlegen wolltest, kannst du diese E-Mail ignorieren.",
    htmlLang: "de",
    footerLine: "Jedes Portfolio verdient ein bisschen Glück 🍀",
  },
};

const es: IdpUiCopy & { email: IdpEmailStrings } = {
  languageLabel: "Idioma",
  headingSignup: "Crea tu cuenta",
  headingLogin: "Bienvenido de nuevo",
  subtitleSignup: "Una contraseña para trefolio, Clara y Will.",
  subtitleLogin: "Inicia sesión con tu cuenta de trefolio",
  continueToPrefix: "Continuar en",
  invalidClientBanner:
    "Este enlace de acceso no es válido o ha caducado. Abre la aplicación desde la que venías e inténtalo de nuevo.",
  errInvalidCredentialsSignup:
    "Este correo ya tiene una cuenta. Introduce tu contraseña para continuar o inicia sesión con Google.",
  errInvalidCredentialsLogin: "El correo o la contraseña no son correctos.",
  errPasswordMismatch: "Las contraseñas no coinciden. Escribe la misma dos veces.",
  errPasswordTooShort: "La contraseña debe tener al menos 8 caracteres.",
  errVerificationEmailFailed:
    "No pudimos enviar el correo de verificación. Comprueba RESEND_API_KEY en el servidor o inténtalo de nuevo.",
  errBlockedEmailDomain:
    "No se permiten direcciones de correo desechables. Usa un correo real.",
  errInvalidClient: "Este enlace de acceso no es válido.",
  dividerEmail: "o con correo electrónico",
  googleCta: "Continuar con Google",
  passkeySignIn: "Iniciar sesión con passkey",
  passkeyWaiting: "Esperando passkey…",
  nameLabel: "Tu nombre",
  namePlaceholder: "¿Cómo te llamamos?",
  emailLabel: "Correo electrónico",
  emailPlaceholder: "tu@ejemplo.com",
  passwordLabel: "Contraseña",
  passwordPlaceholderNew: "Al menos 8 caracteres",
  passwordPlaceholderLogin: "••••••••",
  passwordRepeat: "Repetir contraseña",
  passwordRepeatPlaceholder: "Igual que arriba",
  createAccount: "Crear una cuenta nueva",
  alreadyHaveAccount: "¿Ya tienes cuenta?",
  signIn: "Iniciar sesión",
  newHere: "¿Nuevo por aquí?",
  createNewAccount: "Crear una cuenta nueva",
  signInButton: "Iniciar sesión",
  legalIntro: "Al continuar aceptas los",
  legalTerms: "Términos",
  legalAnd: "y la",
  legalPrivacy: "Política de privacidad",
  devSeeds: "Cuentas de prueba (dev):",
  footerPrivacy: "Privacidad",
  footerTerms: "Términos",
  footerContact: "Contacto",
  checkEmailTitle: "Revisa tu correo",
  checkEmailSubtitle: "Te enviamos un enlace para confirmar tu cuenta de trefolio.",
  checkEmailBody1: "Abre el mensaje que enviamos a",
  checkEmailBody2: "y pulsa",
  checkEmailVerifyWord: "Verificar correo",
  checkEmailBody3: "El enlace se abre en",
  checkEmailHost: "user.trefolio.com",
  checkEmailBody4: "y caduca en 24 horas.",
  wrongInbox: "¿No es tu bandeja?",
  startOver: "Empezar de nuevo",
  resendSent: "Correo de verificación reenviado.",
  resendError: "No se pudo reenviar.",
  resendSending: "Enviando…",
  resendCooldownPrefix: "Reenvío disponible en ",
  resendCooldownSuffix: "s",
  resendButton: "Reenviar correo de verificación",
  emailConfirmedTitle: "Correo confirmado",
  emailConfirmedSubtitle:
    "Tu correo está verificado. Puedes usar esta cuenta en trefolio, Clara y Will.",
  emailConfirmedCountdownBefore: "Te llevamos a la app en",
  emailConfirmedCountdownAfter: "s…",
  homeTitle: "Una cuenta para trefolio, Clara y Will.",
  homeBody:
    "Estás en el servicio de identidad de trefolio. Usa tu cuenta de trefolio para iniciar sesión de forma segura en todos nuestros productos con el mismo correo y contraseña.",
  homeSignInHintBefore: "Para iniciar sesión, abre trefolio, Clara o Will y pulsa ",
  homeSignInCta: "Iniciar sesión",
  homeSignInHintAfter: ". Volverás aquí para autenticarte.",
  productPortfolio: "Panel de cartera",
  productAssistant: "Asistente de finanzas personales",
  productNotes: "Asistente de notas inteligentes",
  email: {
    subject: "Verifica tu correo — trefolio",
    heading: "Verifica tu dirección de correo",
    body: "¡Gracias por registrarte! Confirma tu correo para activar tu cuenta de trefolio: un solo acceso para trefolio, Clara y Will.",
    ctaLabel: "Verificar correo",
    fallbackLink: "O copia y pega este enlace en el navegador:",
    expiry: "Este enlace caduca en 24 horas.",
    ignore: "Si no empezaste a crear una cuenta en trefolio, puedes ignorar este mensaje.",
    htmlLang: "es",
    footerLine: "Toda cartera merece un poco de suerte 🍀",
  },
};

const fr: IdpUiCopy & { email: IdpEmailStrings } = {
  languageLabel: "Langue",
  headingSignup: "Créer votre compte",
  headingLogin: "Bon retour",
  subtitleSignup: "Un mot de passe pour trefolio, Clara et Will.",
  subtitleLogin: "Connectez-vous avec votre compte trefolio",
  continueToPrefix: "Continuer vers",
  invalidClientBanner:
    "Ce lien de connexion est invalide ou expiré. Ouvrez l’application d’où vous venez et réessayez.",
  errInvalidCredentialsSignup:
    "Cet e-mail a déjà un compte. Saisissez votre mot de passe pour continuer, ou connectez-vous avec Google.",
  errInvalidCredentialsLogin: "E-mail ou mot de passe incorrect.",
  errPasswordMismatch: "Les mots de passe ne correspondent pas. Saisissez le même mot de passe deux fois.",
  errPasswordTooShort: "Le mot de passe doit contenir au moins 8 caractères.",
  errVerificationEmailFailed:
    "Impossible d’envoyer l’e-mail de vérification. Vérifiez RESEND_API_KEY sur le serveur ou réessayez.",
  errBlockedEmailDomain:
    "Les adresses e-mail jetables ne sont pas autorisées. Utilisez une adresse réelle.",
  errInvalidClient: "Ce lien de connexion est invalide.",
  dividerEmail: "ou avec l’e-mail",
  googleCta: "Continuer avec Google",
  passkeySignIn: "Se connecter avec une clé d’accès",
  passkeyWaiting: "En attente de la clé d’accès…",
  nameLabel: "Votre nom",
  namePlaceholder: "Comment vous appeler ?",
  emailLabel: "E-mail",
  emailPlaceholder: "vous@exemple.com",
  passwordLabel: "Mot de passe",
  passwordPlaceholderNew: "Au moins 8 caractères",
  passwordPlaceholderLogin: "••••••••",
  passwordRepeat: "Confirmer le mot de passe",
  passwordRepeatPlaceholder: "Identique ci-dessus",
  createAccount: "Créer un nouveau compte",
  alreadyHaveAccount: "Vous avez déjà un compte ?",
  signIn: "Se connecter",
  newHere: "Nouveau ?",
  createNewAccount: "Créer un nouveau compte",
  signInButton: "Se connecter",
  legalIntro: "En continuant, vous acceptez les",
  legalTerms: "Conditions",
  legalAnd: "et la",
  legalPrivacy: "Politique de confidentialité",
  devSeeds: "Comptes de dev :",
  footerPrivacy: "Confidentialité",
  footerTerms: "Conditions",
  footerContact: "Contact",
  checkEmailTitle: "Vérifiez votre e-mail",
  checkEmailSubtitle: "Nous avons envoyé un lien pour confirmer votre compte trefolio.",
  checkEmailBody1: "Ouvrez le message envoyé à",
  checkEmailBody2: "et appuyez sur",
  checkEmailVerifyWord: "Vérifier l’e-mail",
  checkEmailBody3: "Le lien s’ouvre sur",
  checkEmailHost: "user.trefolio.com",
  checkEmailBody4: "et expire dans 24 heures.",
  wrongInbox: "Mauvaise boîte ?",
  startOver: "Recommencer",
  resendSent: "E-mail de vérification renvoyé.",
  resendError: "Impossible de renvoyer.",
  resendSending: "Envoi…",
  resendCooldownPrefix: "Renvoi possible dans ",
  resendCooldownSuffix: "s",
  resendButton: "Renvoyer l’e-mail de vérification",
  emailConfirmedTitle: "E-mail confirmé",
  emailConfirmedSubtitle:
    "Votre e-mail est vérifié. Vous pouvez utiliser ce compte sur trefolio, Clara et Will.",
  emailConfirmedCountdownBefore: "Redirection vers l’application dans",
  emailConfirmedCountdownAfter: "s…",
  homeTitle: "Un compte pour trefolio, Clara et Will.",
  homeBody:
    "Vous êtes sur le service d’identité trefolio. Utilisez votre compte trefolio pour vous connecter en toute sécurité à tous nos produits avec le même e-mail et mot de passe.",
  homeSignInHintBefore: "Pour vous connecter, ouvrez trefolio, Clara ou Will et appuyez sur ",
  homeSignInCta: "Connexion",
  homeSignInHintAfter: ". Vous reviendrez ici pour vous authentifier.",
  productPortfolio: "Tableau de bord portefeuille",
  productAssistant: "Assistant finances personnelles",
  productNotes: "Assistant de notes intelligentes",
  email: {
    subject: "Vérifiez votre e-mail — trefolio",
    heading: "Vérifiez votre adresse e-mail",
    body: "Merci de vous être inscrit ! Confirmez votre e-mail pour activer votre compte trefolio — une connexion pour trefolio, Clara et Will.",
    ctaLabel: "Vérifier l’e-mail",
    fallbackLink: "Ou copiez-collez ce lien dans votre navigateur :",
    expiry: "Ce lien expire dans 24 heures.",
    ignore: "Si vous n’avez pas commencé à créer un compte trefolio, ignorez ce message.",
    htmlLang: "fr",
    footerLine: "Chaque portefeuille mérite un peu de chance 🍀",
  },
};

const it: IdpUiCopy & { email: IdpEmailStrings } = {
  languageLabel: "Lingua",
  headingSignup: "Crea il tuo account",
  headingLogin: "Bentornato",
  subtitleSignup: "Una password per trefolio, Clara e Will.",
  subtitleLogin: "Accedi con il tuo account trefolio",
  continueToPrefix: "Continua su",
  invalidClientBanner:
    "Questo link di accesso non è valido o è scaduto. Apri l’app da cui arrivi e riprova.",
  errInvalidCredentialsSignup:
    "Questa email ha già un account. Inserisci la password per continuare oppure accedi con Google.",
  errInvalidCredentialsLogin: "Email o password non corretti.",
  errPasswordMismatch: "Le password non coincidono. Digita la stessa password due volte.",
  errPasswordTooShort: "La password deve avere almeno 8 caratteri.",
  errVerificationEmailFailed:
    "Impossibile inviare l’email di verifica. Controlla RESEND_API_KEY sul server o riprova.",
  errBlockedEmailDomain:
    "Gli indirizzi email usa e getta non sono consentiti. Usa un indirizzo email reale.",
  errInvalidClient: "Questo link di accesso non è valido.",
  dividerEmail: "oppure con email",
  googleCta: "Continua con Google",
  passkeySignIn: "Accedi con passkey",
  passkeyWaiting: "In attesa della passkey…",
  nameLabel: "Il tuo nome",
  namePlaceholder: "Come possiamo chiamarti?",
  emailLabel: "Email",
  emailPlaceholder: "tu@esempio.com",
  passwordLabel: "Password",
  passwordPlaceholderNew: "Almeno 8 caratteri",
  passwordPlaceholderLogin: "••••••••",
  passwordRepeat: "Ripeti password",
  passwordRepeatPlaceholder: "Come sopra",
  createAccount: "Crea un nuovo account",
  alreadyHaveAccount: "Hai già un account?",
  signIn: "Accedi",
  newHere: "Nuovo qui?",
  createNewAccount: "Crea un nuovo account",
  signInButton: "Accedi",
  legalIntro: "Continuando accetti i",
  legalTerms: "Termini",
  legalAnd: "e l’",
  legalPrivacy: "Informativa sulla privacy",
  devSeeds: "Account di sviluppo:",
  footerPrivacy: "Privacy",
  footerTerms: "Termini",
  footerContact: "Contatti",
  checkEmailTitle: "Controlla la tua email",
  checkEmailSubtitle: "Ti abbiamo inviato un link per confermare il tuo account trefolio.",
  checkEmailBody1: "Apri il messaggio inviato a",
  checkEmailBody2: "e tocca",
  checkEmailVerifyWord: "Verifica email",
  checkEmailBody3: "Il link si apre su",
  checkEmailHost: "user.trefolio.com",
  checkEmailBody4: "e scade tra 24 ore.",
  wrongInbox: "Casella sbagliata?",
  startOver: "Ricomincia",
  resendSent: "Email di verifica inviata di nuovo.",
  resendError: "Impossibile reinviare.",
  resendSending: "Invio in corso…",
  resendCooldownPrefix: "Reinvio disponibile tra ",
  resendCooldownSuffix: "s",
  resendButton: "Reinvia email di verifica",
  emailConfirmedTitle: "Email confermata",
  emailConfirmedSubtitle:
    "La tua email è verificata. Puoi usare questo account su trefolio, Clara e Will.",
  emailConfirmedCountdownBefore: "Reindirizzamento all’app tra",
  emailConfirmedCountdownAfter: "s…",
  homeTitle: "Un account per trefolio, Clara e Will.",
  homeBody:
    "Sei sul servizio identità trefolio. Usa il tuo account trefolio per accedere in modo sicuro a tutti i nostri prodotti con la stessa email e password.",
  homeSignInHintBefore: "Per accedere, apri trefolio, Clara o Will e tocca ",
  homeSignInCta: "Accedi",
  homeSignInHintAfter: ". Tornerai qui per autenticarti.",
  productPortfolio: "Dashboard portafoglio",
  productAssistant: "Assistente finanza personale",
  productNotes: "Assistente note intelligenti",
  email: {
    subject: "Verifica la tua email — trefolio",
    heading: "Verifica il tuo indirizzo email",
    body: "Grazie per esserti registrato! Conferma la tua email per attivare il tuo account trefolio — un solo accesso per trefolio, Clara e Will.",
    ctaLabel: "Verifica email",
    fallbackLink: "Oppure copia e incolla questo link nel browser:",
    expiry: "Questo link scade tra 24 ore.",
    ignore: "Se non hai iniziato a creare un account trefolio, puoi ignorare questa email.",
    htmlLang: "it",
    footerLine: "Ogni portafoglio merita un po’ di fortuna 🍀",
  },
};

const PACKS: Record<IdpLocale, IdpUiCopy & { email: IdpEmailStrings }> = {
  en,
  de,
  es,
  fr,
  it,
};

export function getIdpUiCopy(locale: IdpLocale): IdpUiCopy {
  const { email: _e, ...ui } = PACKS[locale];
  return ui;
}

export function getIdpEmailStrings(locale: IdpLocale): IdpEmailStrings {
  return PACKS[locale].email;
}

export const LANGUAGE_CHOICES: { locale: IdpLocale; label: string }[] = [
  { locale: "en", label: "English" },
  { locale: "de", label: "Deutsch" },
  { locale: "es", label: "Español" },
  { locale: "fr", label: "Français" },
  { locale: "it", label: "Italiano" },
];
