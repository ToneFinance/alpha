"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import styles from "./ShareCertificateAnimation.module.css";

interface ShareCertificateAnimationProps {
  depositId: bigint;
  amount: string;
  timestamp?: bigint;
  fulfilled: boolean;
  onClose?: () => void;
  isModal?: boolean;
}

export function ShareCertificateAnimation({
  depositId,
  amount,
  timestamp,
  fulfilled,
  onClose,
  isModal = false,
}: ShareCertificateAnimationProps) {
  const [showStamp, setShowStamp] = useState(false);
  const [animateOut, setAnimateOut] = useState(false);

  const date = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    if (fulfilled && !showStamp) {
      setShowStamp(true);
      // After stamp animation, trigger close
      setTimeout(() => {
        setAnimateOut(true);
        setTimeout(() => {
          onClose?.();
        }, 500);
      }, 2000);
    }
  }, [fulfilled, showStamp, onClose]);

  return (
    <>
      {isModal && (
        <motion.div
          className={styles.modalOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: animateOut ? 0 : 1 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
        />
      )}
      <motion.div
        className={isModal ? styles.certificateContainerModal : styles.certificateContainer}
        initial={{ opacity: 0, scale: 0.8, y: isModal ? 50 : 0 }}
        animate={{
          opacity: animateOut ? 0 : 1,
          scale: animateOut ? 0.95 : 1,
          y: animateOut ? (isModal ? 50 : 0) : 0,
        }}
        transition={{ duration: 0.4, type: "spring" }}
      >
        {/* Ornate border */}
        <motion.div
          className={styles.certificate}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* Corner decorations */}
          <div className={styles.cornerTopLeft} />
          <div className={styles.cornerTopRight} />
          <div className={styles.cornerBottomLeft} />
          <div className={styles.cornerBottomRight} />

          {/* Certificate content */}
          <div className={styles.certificateContent}>
            <motion.div
              className={styles.header}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              <h2>SHARE CERTIFICATE</h2>
              <div className={styles.ornament}>✦</div>
            </motion.div>

            <motion.div
              className={styles.body}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              <p className={styles.thisIs}>This certifies that</p>

              <motion.div
                className={styles.recipientBox}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.3, duration: 0.4, ease: "easeOut" }}
              >
                <span className={styles.bearer}>THE BEARER</span>
              </motion.div>

              <p className={styles.owns}>is the registered owner of</p>

              <motion.div
                className={styles.amountBox}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, duration: 0.4, type: "spring", stiffness: 200 }}
              >
                <span className={styles.amount}>{amount} USDC</span>
              </motion.div>

              <p className={styles.sharesText}>in sector index shares</p>

              <motion.div
                className={styles.footer}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.3 }}
              >
                <div className={styles.details}>
                  <div>
                    <span className={styles.label}>Certificate No.</span>
                    <span className={styles.value}>#{depositId.toString()}</span>
                  </div>
                  <div>
                    <span className={styles.label}>Issue Date</span>
                    <span className={styles.value}>{formattedDate}</span>
                  </div>
                </div>

                <motion.div
                  className={styles.signature}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9, duration: 0.5 }}
                >
                  <svg viewBox="0 0 200 60" className={styles.signatureSvg}>
                    <motion.path
                      d="M10,40 Q30,10 50,35 T90,30 Q100,25 110,30 T140,35 Q160,25 180,40"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 1, duration: 1, ease: "easeInOut" }}
                    />
                  </svg>
                  <span className={styles.signatureLabel}>Authorized Signature</span>
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Stamp animation */}
            <AnimatePresence>
              {showStamp && (
                <motion.div
                  className={styles.stamp}
                  initial={{ scale: 0, rotate: -20, opacity: 0 }}
                  animate={{ scale: 1, rotate: -15, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 10,
                    duration: 0.6,
                  }}
                >
                  <motion.div
                    className={styles.stampInner}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                  >
                    <div className={styles.stampText}>
                      <div>ISSUED</div>
                      <div className={styles.stampDate}>
                        {new Date().toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Processing indicator */}
            {!fulfilled && (
              <motion.div
                className={styles.processing}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <span>⏳ Processing certificate issuance...</span>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
