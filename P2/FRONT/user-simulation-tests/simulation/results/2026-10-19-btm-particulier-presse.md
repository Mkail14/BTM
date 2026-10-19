# Simulation report — btm-particulier-presse (End user: private individual in a hurry, planning a garage slab)

**Task:** Get a budget estimate for a garage slab of about 30 m², from your own measurements.
**Result:** Goal reached
**Steps:** 12 · **Total estimated time:** 119 s (does not include the wait for the e-mail to arrive)

> **Run context:** https://www.btm.yt, mobile viewport 390×844, run date 2026-10-19. The user agreed to create an account, because the product only shows the quote to account holders. Google and Apple sign-in were not available to the simulator, so the user signed up by e-mail. **Steps 10–11 include an orchestrator bridge.** The simulator could not open the mailbox, so instead of confirming the e-mail outside the site, it logged in with a test account that was already confirmed (btmsim1), using "J'ai confirmé, me connecter". **This run did not observe how long the e-mail takes to arrive or where the confirmation link lands.** Step 8 was recorded in French and is reported here in English.

## Step-by-step walkthrough
| # | Screen | Action | Clarity | Doubt |
|---|--------|--------|---------|-------|
| 1 | Home (mobile), hero "Le devis de vos travaux" | Dismisses the cookie banner, taps the "Dalle" shortcut | High | No |
| 2 | Calculateur dalle — Étape 2/5, Question 1/3 (length) | Types 6, Continuer | High | Yes |
| 3 | Calculateur dalle — Étape 3/5, Question 2/3 (width) | Types 5, Continuer | High | Yes |
| 4 | Calculateur dalle — Étape 4/5, Question 3/3 (thickness) | Types 12 (middle of the 10–15 cm hint), Continuer | High | Yes |
| 5 | Étape 5/5 "Tout est prêt !" recap + account lock line | Checks the recap, taps "Obtenir mon devis" | High | Yes |
| 6 | Modal "Créer un compte" | Taps the Particulier card (Google/Apple not available) | High | Yes |
| 7 | Sign-up 1/3 Identité | Civilité, first name, last name, e-mail, Continuer | High | Yes |
| 8 | Sign-up 2/3 Sécurité | Phone (+262), password ×2, Continuer | High | Yes |
| 9 | Sign-up 3/3 Validation | Ticks the terms box, "Créer mon compte" | High | No |
| 10 | "Plus qu'une étape : confirmez votre e-mail" | Goes to the mailbox (bridge: log in with confirmed account) | High | Yes |
| 11 | Login dialog (lock line still says "Créez votre compte gratuit…") | Types the password, "Se connecter" | Medium | Yes |
| 12 | /resultats "Votre dalle coûtera environ 1 827,60 €" | Reads the total and the Batimax price, stops: goal reached | High | Yes |

## Per-screen detail

### Step 1 — Home (mobile)
- **Action & thinking:** I tap "J'ai compris" to get rid of the cookie banner without reading it. Then I tap "Dalle" right under "Que voulez-vous construire ?" because it's the fastest way to a slab estimate. I skip the reviews and the projects section, but I notice the 32 m² garage slab card, which tells me my kind of job is covered.
- **Clarity:** High · **Doubt:** No · **Time:** 6s
- **Emotional state:** Good. A big "quote for your works" heading and a Dalle button mean I don't have to dig. The 32 m² garage slab card is nearly my job, so I feel I'm in the right place.
- **Accumulated memory:** "Landed on BTM. It's a quote tool for walls, slabs and so on, and there's a Dalle shortcut right at the top, so I'm going straight there. Someone did a 32 m² garage slab with it, basically my 30 m², so this should give me a number. I just want to see a price."

### Step 2 — Calculateur dalle, Étape 2 sur 5 / Question 1 sur 3 (length)
- **Action & thinking:** I tap the empty length field, type 6 and hit "Continuer" without looking at the 3D model. The question is short and clear. The "48 m²" under the model catches my eye because it isn't my 30, but I take it as a default that will update. Seeing "Étape 2 sur 5" and "Question 1 sur 3" makes me think this will take longer than I'd like.
- **Clarity:** High · **Doubt:** Yes · **Time:** 8s
- **Emotional state:** It's an easy question and I know the answer, so I go fast. But two counters on one screen tell me there's more to fill in than I hoped.
- **Accumulated memory:** It changes from "go to Dalle" to "it's asking for dimensions one at a time". I'm counting on the next ones being just as quick. The 48 m² is "probably a placeholder".

### Step 3 — Calculateur dalle, Étape 3 sur 5 / Question 2 sur 3 (width)
- **Action & thinking:** I type 5 and tap "Continuer". It's the same pattern as before, so I don't stop. The caption now says 36 m² when 6 × 5 should be 30. I figure it's still using a default width until I enter mine.
- **Clarity:** High · **Doubt:** Yes · **Time:** 5s
- **Emotional state:** Quick and easy. The 36 m² annoys me a little. I expect it to fix itself.
- **Accumulated memory:** My trust now depends on the number: "The area went from 48 to 36 and neither is my 30. If it doesn't say about 30 m² after this, I'll get suspicious."

### Step 4 — Calculateur dalle, Étape 4 sur 5 / Question 3 sur 3 (thickness)
- **Action & thinking:** The caption finally says 30 m². I skip the explanation and type 12 in the empty thickness field, right between the 10 and 15 in the hint, then tap Continuer. I have no idea what thickness I actually need, so I guess. I also notice the caption already shows 3,6 m³ before I've typed any thickness, but I don't stop to work out why.
- **Clarity:** High · **Doubt:** Yes · **Time:** 6s
- **Emotional state:** Relief that the area is 30 m², so the 48 and 36 were just the model updating. Picking a thickness I don't understand is a guess, but the hint makes 12 feel safe.
- **Accumulated memory:** My doubt about the area is resolved. A new uncertainty appears that I don't acknowledge ("the thickness question lost me for a second"). My expectation is fixed: "the next screen should be the price, and it had better not ask me for anything else first."

### Step 5 — Étape 5 sur 5 "Tout est prêt !" (recap + lock)
- **Action & thinking:** The recap (6 m, 5 m, 12 cm) matches what I typed. I skim the lock line "Pour voir le prix, un compte gratuit vous sera demandé (moins d'une minute) : vos réponses sont gardées." and tap "Obtenir mon devis" right away. I wanted the number on this screen. "Under a minute" convinces me to try.
- **Clarity:** High · **Doubt:** Yes · **Time:** 6s
- **Emotional state:** A bit deflated. I finished all 5 steps and there's still no price. The promises (under a minute, answers kept) keep me going, but I'm already impatient.
- **Accumulated memory:** The step-4 expectation is broken. I set a clear condition for quitting: "if the sign-up turns into a long form I'm closing the tab and just calling a mason."

### Step 6 — Modal "Créer un compte"
- **Action & thinking:** I would normally tap "S'inscrire avec Google", but that isn't possible here. So I tap the "Particulier — Je prépare mon propre chantier…" card, because it mentions a slab. I can't see how many fields are coming, which makes me wary.
- **Clarity:** High · **Doubt:** Yes · **Time:** 6s
- **Emotional state:** Relieved that it says "Gratuit" twice and starts with one tap instead of a wall of fields. But "Continuer" means more screens are coming.
- **Accumulated memory:** "They said under a minute, and I'm counting." I'm now keeping track of time against the promise.

### Step 7 — Sign-up 1/3 Identité
- **Action & thinking:** I tap Monsieur, quickly type my first name, last name and e-mail, and hit Continuer. It's four short fields and the stepper shows 3 steps. But "Sécurité" and "Validation" still come after this, which is more than the single step I expected.
- **Clarity:** High · **Doubt:** Yes · **Time:** 20s
- **Emotional state:** Four fields is fine. But "1 of 3" bugs me, and "Validation" sounds like an e-mail code, exactly the kind of extra step that makes me want to drop out.
- **Accumulated memory:** I now expect "a password and maybe a code by e-mail. If that drags on or makes me dig through my inbox, I'm calling the mason directly."

### Step 8 — Sign-up 2/3 Sécurité
- **Action & thinking:** I leave Mayotte (+262), type the phone number, type the password twice and tap Continuer. Only the phone field has an asterisk, and for a second I wonder whether the password is required too. I skip the help text and only catch "retrait de matériaux". I still wonder why they need my number when I only want a price.
- **Clarity:** High · **Doubt:** Yes · **Time:** 20s
- **Emotional state:** A bit annoyed at being asked for my phone number, but it's only three fields, so it's OK. I see "Validation" next and worry about a code by SMS or e-mail.
- **Accumulated memory:** A new grievance appears ("why do they want my number for an estimate?"). Patience is running low: "this price had better be worth it."

### Step 9 — Sign-up 3/3 Validation
- **Action & thinking:** I glance at the recap, tick "J'accepte les conditions générales d'utilisation" without opening anything, and tap "Créer mon compte". It's a short recap, one checkbox and an obvious button.
- **Clarity:** High · **Doubt:** No · **Time:** 6s
- **Emotional state:** Relief: no new fields. Still tense, because nothing here says whether the price will appear right away or whether I'll have to confirm my e-mail first.
- **Accumulated memory:** "Come on, show me the figure now." The worry about the phone number is still there.

### Step 10 — "Plus qu'une étape : confirmez votre e-mail"
- **Action & thinking:** I read the heading and the line "Votre devis est enregistré : ce lien vous ramène directement à son résultat." Then I switch to my mail app to open the link. The next action is clear, but it's one more step after I thought "Créer mon compte" was the last one. I'm not sure whether I should tap "J'ai confirmé, me connecter" afterwards or whether the link alone is enough. *(Bridge: the simulator logs in with the already-confirmed account through "J'ai confirmé, me connecter". E-mail delivery time was not measured.)*
- **Clarity:** High · **Doubt:** Yes · **Time:** 8s
- **Emotional state:** "Ugh, another step, and still no number." What keeps me going is the promise that my estimate is saved and the link brings me straight back to it.
- **Accumulated memory:** "So the account wasn't the last step after all." My exit condition gets stricter: "If it isn't there in a minute or the link drops me somewhere else, I'm done."

### Step 11 — Login dialog
- **Action & thinking:** My e-mail is already filled in, so I type my password, leave "Rester connecté" ticked and tap "Se connecter". But the line at the top still says "Créez votre compte gratuit pour obtenir votre devis" when I just created and confirmed one. For a second it looks like the app doesn't know I signed up. It's the third time I type the same password. *(Bridge: the e-mail was switched to the confirmed test account before submitting.)*
- **Clarity:** Medium · **Doubt:** Yes · **Time:** 8s
- **Emotional state:** Mild annoyance. The prefilled e-mail helps, but my patience is almost gone.
- **Accumulated memory:** "A login screen that still says 'create your free account', like it forgot I just did." This is the closest I get to quitting: "If this doesn't drop me straight onto my saved estimate with a number, I'm going to work it out myself and just call a mason."

### Step 12 — /resultats
- **Action & thinking:** I look at the big number first: "Votre dalle coûtera environ 1 827,60 €" for my 30 m². I glance at the shopping list (béton 8,64 t, treillis 150 kg, gravier 2,88 t), see Batimax at 1 781,33 € as the best price, and stop. The line "Enregistrez ce devis pour obtenir votre code de retrait" bothers me. I thought logging in had already saved it, and I don't see an obvious save button. But I only need the figure.
- **Clarity:** High · **Doubt:** Yes · **Time:** 20s
- **Emotional state:** Relief, finally a number, and about what I expected for a garage. The "save this estimate" line makes me wonder whether all the account steps saved anything, but I shrug it off.
- **Accumulated memory:** "About 1,830 €, or around 1,780 € at Batimax with their code. That's my budget for the garage slab, done. Still a bit odd that it tells me to save the estimate after all that account stuff, but I'm not going to dig. I'm calling the mason with that number."

## Synthesis
- **Highest friction point:** Step 11, the login dialog. It's the only screen with Medium clarity. Its lock line ("Créez votre compte gratuit pour obtenir votre devis") contradicts what the user has just done. It also asks for the password a third time, at the moment the user's patience is lowest. More broadly, the friction is structural. Steps 5 to 11 are seven screens of account steps between the last input (step 4) and the figure (step 12). The figure also shows up with a third contradiction of the "it's saved" promise ("Enregistrez ce devis…").
- **Highest emotional friction point:** Step 10, "Plus qu'une étape : confirmez votre e-mail". The user believed "Créer mon compte" was the last step. Here the "less than a minute" promise from step 5 visibly breaks ("Ugh, another step, and still no number"), and the user sets their strictest exit condition. Only the line "Votre devis est enregistré" keeps them going. Step 11 then pushes them close to quitting.
- **Final decision:** Continues and reaches the goal at step 12. They accept the headline figure (about 1 827,60 € / Batimax 1 781,33 €) without looking into it, and plan to take it to the mason.
- **Emotional summary:** "I came in fast and confident: there was a Dalle button, three easy questions, and my 30 m² finally showed up. I was sure the next screen would be the price. Instead it was a lock. Fine, 'under a minute', I counted. Name, e-mail, then a phone number I didn't see why they needed, a password twice, a box to tick... and then 'one more step, confirm your e-mail'. That's where I almost gave up. Then a login screen telling me to create an account I'd just created. When the number finally showed up, I was mostly relieved it was over. It looks about right, so I'm taking it. I still don't really know whether my estimate is saved, since the page tells me to save it, and I never actually knew what thickness I needed."
- **Detected risks:**
  - **People giving up during the account steps.** This profile only got through by bargaining with itself at every screen (steps 5, 7, 8, 10, 11). A real user without Google, or with a slow e-mail, is likely to quit at step 10. E-mail delivery and the confirmation-link landing were not observed, so this risk is unmeasured.
  - **A thickness picked blindly.** 12 cm was chosen as "the middle of the hint" without understanding it (step 4). The caption already showed 3,6 m³ before anything was typed, which suggests a hidden 12 cm default. A user who guessed differently, or who relies on the default, gets a budget that isn't based on their actual job.
  - **Taking the figure as all-inclusive.** The user leaves with "my budget for the garage slab" to show the mason. Nothing in the run shows they understood whether 1 827,60 € covers materials only. This is a misunderstanding the user never notices, which is the typical failure for this profile.
  - **Missing the pickup code.** The user ignores "Enregistrez ce devis pour obtenir votre code de retrait" but remembers the Batimax price "with their code". They may go to the supplier expecting the BTM price without having the code.
  - **Trust eroded by contradictory copy.** "Votre devis est enregistré" (step 10), then "Créez votre compte gratuit" (step 11), then "Enregistrez ce devis" (step 12). That's three conflicting messages about the same state.
  - **The phone number feels unjustified.** It's the only field with an asterisk, and the help text is skipped. This creates resentment, and some users may drop out or enter a fake number.
- **Structural insight:** The calculator is excellent. It's fast, clear and gives visible feedback (30 m² confirmed). The weak part is the transition after it. The flow promises "less than a minute" and "your answers are kept", then contradicts both, several times: three sign-up screens, an e-mail confirmation, a login that ignores the account state, and a result that asks to be saved. For a user who trusts what's on screen, the problem isn't the number of steps by itself. It's that the interface doesn't keep track of where the user is and contradicts its own promises. The account requirement is accepted. The inconsistency is what wears down trust.
- **Fix this first:** In the login dialog opened from "J'ai confirmé, me connecter" (step 11), replace the lock line "Créez votre compte gratuit pour obtenir votre devis." with copy that reflects the actual state, such as "Compte créé — connectez-vous pour afficher votre devis enregistré (dalle 30 m²)." This is the only Medium-clarity screen in the run. It hits when patience is lowest and directly contradicts the step-10 promise.

## Potential improvements

| # | Screen / moment | Actionable change | Why it matters |
|---|-----------------|-------------------|----------------|
| 1 | Step 11 — login dialog after "J'ai confirmé, me connecter" | Replace "Créez votre compte gratuit pour obtenir votre devis." with "Compte créé — connectez-vous pour afficher votre devis enregistré" when the dialog is opened from the confirmation screen, and show the job (dalle 30 m²) as proof the quote was kept. | It removes the only Medium-clarity moment and the contradiction that pushed the user closest to quitting. |
| 2 | Step 12 — /resultats, line "Enregistrez ce devis pour obtenir votre code de retrait" | For a logged-in user whose quote was saved during sign-up, show the pickup code directly (or "Devis enregistré ✓ — code de retrait : XXXX"). If an action is truly needed, put a visible "Enregistrer et obtenir mon code" button next to the Batimax price. | It keeps the step-10 promise and stops users from going to the supplier without the code that gives them the displayed price. |
| 3 | Step 5 — lock line, and step 7 — sign-up stepper | Make the promise match reality: change "(moins d'une minute)" to "3 écrans + confirmation par e-mail", or add a 4th "Confirmation e-mail" step to the stepper so it isn't a surprise at step 10. | The broken "under a minute" promise set off the step-10 emotional drop. An expected step causes less frustration than a surprise one. |
| 4 | Step 4 — thickness field and 3D caption | Don't show 3,6 m³ until a thickness is entered (or show "épaisseur à définir"). Replace the bare hint "Généralement 10 à 15 cm" with a choice such as "Garage / voiture : 12 cm (recommandé)". | It avoids an unexplained figure and turns a blind guess into a choice linked to the user's actual job. |
| 5 | Step 12 — headline "Votre dalle coûtera environ 1 827,60 €" | Add a short qualifier directly in the headline (for example "environ 1 827,60 € de matériaux — hors main-d'œuvre"), not in body text. | This profile only reads the big number. A caveat in body text won't stop them presenting the figure to the mason as an all-inclusive price. |
